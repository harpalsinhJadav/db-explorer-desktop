/**
 * Electron main process.
 * ----------------------
 * This is the Node.js side of the app. Unlike a browser, it CAN open a raw TCP
 * connection to any PostgreSQL server (direct or pooled) using node-postgres
 * (`pg`). The React renderer never touches `pg` directly — it calls the IPC
 * handlers below through the preload bridge (see preload.cjs).
 *
 * All database access lives here: connect, schema introspection, and CRUD via
 * parameterized SQL. Identifiers are validated and quoted to avoid injection.
 */
const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const url = require('node:url');

// Register "app" as a standard, secure origin BEFORE app is ready so that
// Chromium grants it the same privileges as https://.  This prevents the
// "crossorigin" CORS rejection that Chromium applies to file:// module scripts
// and also makes BrowserRouter's pushState navigation work on all platforms.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);
const { Pool, types } = require('pg');

// node-pg returns numeric/bigint as strings to preserve precision. For a UI
// grid we want real numbers so number filters/sorting work.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8

let pool = null; // current pg connection pool
const metaCache = new Map(); // "schema.table" -> { columns, pk }
let enumCache = null; // { enum_type_name: [labels] }

// PostgreSQL internal schemas that should never be shown to users.
const SYSTEM_SCHEMAS = new Set([
  'information_schema',
  'pg_catalog',
  'pg_toast',
  'pg_temp_1',
  'pg_toast_temp_1',
]);

// --- helpers ---------------------------------------------------------------

function buildPgConfig(config = {}) {
  const ssl = config.ssl ? { rejectUnauthorized: false } : false;
  if (config.connectionString && config.connectionString.trim()) {
    return { connectionString: config.connectionString.trim(), ssl };
  }
  return {
    host: config.host || 'localhost',
    port: Number(config.port) || 5432,
    database: config.database || undefined,
    user: config.user || undefined,
    password: config.password || undefined,
    ssl,
  };
}

function requirePool() {
  if (!pool) {
    throw new Error('Not connected to a database. Configure it in Settings.');
  }
  return pool;
}

// Validate + quote a SQL identifier (schema, table, or column).
function ident(name) {
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

async function getSchemasImpl() {
  const { rows } = await requirePool().query(
    `SELECT schema_name
       FROM information_schema.schemata
      WHERE schema_name NOT LIKE 'pg_%'
        AND schema_name != 'information_schema'
      ORDER BY schema_name`
  );
  return rows.map((r) => r.schema_name);
}

async function getTablesImpl(schema = 'public') {
  const { rows } = await requirePool().query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = $1 AND table_type = 'BASE TABLE'
      ORDER BY table_name`,
    [schema]
  );
  return rows.map((r) => r.table_name);
}

// All enum types in the database -> { typname: [label, ...] } (in sort order).
async function getEnums() {
  if (enumCache) return enumCache;
  const { rows } = await requirePool().query(
    `SELECT t.typname AS enum_name, e.enumlabel AS value
       FROM pg_type t
       JOIN pg_enum e ON e.enumtypid = t.oid
      ORDER BY t.typname, e.enumsortorder`
  );
  const map = {};
  for (const r of rows) {
    (map[r.enum_name] = map[r.enum_name] || []).push(r.value);
  }
  enumCache = map;
  return map;
}

// Full, cached metadata for a table: enriched columns + primary key.
async function tableMeta(schema, table) {
  const cacheKey = `${schema}.${table}`;
  if (metaCache.has(cacheKey)) return metaCache.get(cacheKey);
  const db = requirePool();
  const enums = await getEnums();

  const { rows } = await db.query(
    `SELECT column_name, data_type, udt_name, column_default,
            is_nullable, is_identity, is_generated
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [schema, table]
  );
  if (rows.length === 0) throw new Error(`Table "${schema}"."${table}" not found.`);

  const pkRes = await db.query(
    `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = $1
        AND tc.table_name = $2
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
      LIMIT 1`,
    [schema, table]
  );
  const pk = pkRes.rows[0]?.column_name || null;

  const columns = rows.map((r) => ({
    column_name: r.column_name,
    data_type: r.data_type,
    primary_key: r.column_name === pk,
    required: r.is_nullable === 'NO',
    has_default: r.column_default != null,
    is_identity: r.is_identity === 'YES',
    is_generated: r.is_generated === 'ALWAYS',
    enum_values:
      r.data_type === 'USER-DEFINED' ? enums[r.udt_name] || undefined : undefined,
  }));

  const meta = { columns, pk };
  metaCache.set(cacheKey, meta);
  return meta;
}

async function getTableSchemaImpl(schema, table) {
  const { columns } = await tableMeta(schema, table);
  return columns;
}

// Ensure a table name is real before interpolating it into SQL.
async function assertTable(schema, table) {
  const tables = await getTablesImpl(schema);
  if (!tables.includes(table)) throw new Error(`Unknown table: ${schema}.${table}`);
  return table;
}

async function getTableDataImpl(schema, table) {
  await assertTable(schema, table);
  const { rows } = await requirePool().query(
    `SELECT * FROM ${ident(schema)}.${ident(table)} LIMIT 1000`
  );
  return rows;
}

async function insertRecordImpl(schema, table, record) {
  await assertTable(schema, table);
  const { columns } = await tableMeta(schema, table);
  const valid = new Set(columns.map((c) => c.column_name));
  const cols = Object.keys(record).filter(
    (c) => valid.has(c) && record[c] !== undefined
  );
  if (cols.length === 0) throw new Error('No values to insert.');
  const colSql = cols.map(ident).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const values = cols.map((c) => record[c]);
  const { rows } = await requirePool().query(
    `INSERT INTO ${ident(schema)}.${ident(table)} (${colSql})
     VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
}

async function updateRecordImpl(schema, table, id, changes) {
  await assertTable(schema, table);
  const { columns, pk } = await tableMeta(schema, table);
  if (!pk) throw new Error(`Table "${schema}"."${table}" has no primary key; cannot update.`);
  const updatable = new Set(
    columns
      .filter((c) => !c.primary_key && !c.is_identity && !c.is_generated)
      .map((c) => c.column_name)
  );
  const cols = Object.keys(changes).filter((c) => updatable.has(c));
  if (cols.length === 0) return null;
  const setSql = cols.map((c, i) => `${ident(c)} = $${i + 1}`).join(', ');
  const values = cols.map((c) => changes[c]);
  values.push(id);
  const { rows } = await requirePool().query(
    `UPDATE ${ident(schema)}.${ident(table)} SET ${setSql}
      WHERE ${ident(pk)} = $${values.length} RETURNING *`,
    values
  );
  return rows[0];
}

async function deleteRecordsImpl(schema, table, ids) {
  await assertTable(schema, table);
  const { pk } = await tableMeta(schema, table);
  if (!pk) throw new Error(`Table "${schema}"."${table}" has no primary key; cannot delete.`);
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await requirePool().query(
    `DELETE FROM ${ident(schema)}.${ident(table)}
      WHERE ${ident(pk)} IN (${placeholders}) RETURNING *`,
    ids
  );
  return rows.length;
}

async function connectImpl(config) {
  if (pool) {
    await pool.end().catch(() => {});
    pool = null;
  }
  metaCache.clear();
  enumCache = null;
  pool = new Pool(buildPgConfig(config));
  const { rows } = await pool.query('SELECT version()');
  const version = (rows[0]?.version || 'PostgreSQL').split(',')[0];
  return { ok: true, message: `Connected: ${version}` };
}

// --- IPC wiring ------------------------------------------------------------
// Each handler returns { data } on success or { error } on failure so the
// renderer gets clean error messages (see preload.cjs).
function handle(channel, fn) {
  ipcMain.handle(channel, async (_event, ...args) => {
    try {
      return { data: await fn(...args) };
    } catch (err) {
      return { error: err?.message || String(err) };
    }
  });
}

handle('db:connect', connectImpl);
handle('db:test', connectImpl);
handle('db:getSchemas', getSchemasImpl);
handle('db:getTables', getTablesImpl);
handle('db:getTableSchema', getTableSchemaImpl);
handle('db:getTableData', getTableDataImpl);
handle('db:insert', insertRecordImpl);
handle('db:update', updateRecordImpl);
handle('db:delete', deleteRecordsImpl);

// --- window lifecycle ------------------------------------------------------
function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    win.loadURL(devUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Use the custom app:// protocol so the renderer has a real HTTPS-like
    // origin. This prevents Chromium from rejecting crossorigin module scripts
    // (a known white-screen issue on Windows with file:// URLs) and lets
    // BrowserRouter's pushState navigation work on all platforms.
    win.loadURL('app://localhost/index.html');
  }
}

app.whenReady().then(() => {
  // Serve the built Vite output from dist/ via app://localhost/.
  // Every request that doesn't match a real file (e.g. /dashboard, /settings)
  // falls back to index.html so BrowserRouter can handle client-side routing.
  const distRoot = path.join(__dirname, '..', 'dist');
  protocol.handle('app', (req) => {
    const { pathname } = new url.URL(req.url);
    const filePath = path.join(distRoot, pathname);
    // If the file exists on disk serve it directly; otherwise serve index.html
    // so the React router can handle the path.
    const target = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
      ? filePath
      : path.join(distRoot, 'index.html');
    return net.fetch(url.pathToFileURL(target).toString());
  });

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  if (pool) await pool.end().catch(() => {});
});
