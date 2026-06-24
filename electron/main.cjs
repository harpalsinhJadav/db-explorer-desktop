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
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { Pool, types } = require('pg');

// node-pg returns numeric/bigint as strings to preserve precision. For a UI
// grid we want real numbers so number filters/sorting work.
types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // numeric
types.setTypeParser(20, (v) => (v === null ? null : parseInt(v, 10))); // int8

let pool = null; // current pg connection pool
const metaCache = new Map(); // table -> { columns, pk }
let enumCache = null; // { enum_type_name: [labels] }

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

// Validate + quote a SQL identifier (table or column).
function ident(name) {
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

async function getTablesImpl() {
  const { rows } = await requirePool().query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
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
async function tableMeta(table) {
  if (metaCache.has(table)) return metaCache.get(table);
  const db = requirePool();
  const enums = await getEnums();

  const { rows } = await db.query(
    `SELECT column_name, data_type, udt_name, column_default,
            is_nullable, is_identity, is_generated
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  if (rows.length === 0) throw new Error(`Table "${table}" not found.`);

  const pkRes = await db.query(
    `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = $1
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY kcu.ordinal_position
      LIMIT 1`,
    [table]
  );
  const pk = pkRes.rows[0]?.column_name || null;

  const columns = rows.map((r) => ({
    column_name: r.column_name,
    data_type: r.data_type,
    primary_key: r.column_name === pk,
    // Whether the user must provide a value, and whether the DB fills it.
    required: r.is_nullable === 'NO',
    has_default: r.column_default != null,
    is_identity: r.is_identity === 'YES',
    is_generated: r.is_generated === 'ALWAYS',
    // Enum columns surface as USER-DEFINED; attach their allowed values.
    enum_values:
      r.data_type === 'USER-DEFINED' ? enums[r.udt_name] || undefined : undefined,
  }));

  const meta = { columns, pk };
  metaCache.set(table, meta);
  return meta;
}

async function getTableSchemaImpl(table) {
  const { columns } = await tableMeta(table);
  return columns;
}

// Ensure a table name is real before interpolating it into SQL.
async function assertTable(table) {
  const tables = await getTablesImpl();
  if (!tables.includes(table)) throw new Error(`Unknown table: ${table}`);
  return table;
}

async function getTableDataImpl(table) {
  await assertTable(table);
  const { rows } = await requirePool().query(
    `SELECT * FROM "public".${ident(table)} LIMIT 1000`
  );
  return rows;
}

async function insertRecordImpl(table, record) {
  await assertTable(table);
  const { columns } = await tableMeta(table);
  const valid = new Set(columns.map((c) => c.column_name));
  // Only send real, non-undefined columns; the DB fills identity/defaults.
  const cols = Object.keys(record).filter(
    (c) => valid.has(c) && record[c] !== undefined
  );
  if (cols.length === 0) throw new Error('No values to insert.');
  const colSql = cols.map(ident).join(', ');
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
  const values = cols.map((c) => record[c]);
  const { rows } = await requirePool().query(
    `INSERT INTO "public".${ident(table)} (${colSql})
     VALUES (${placeholders}) RETURNING *`,
    values
  );
  return rows[0];
}

async function updateRecordImpl(table, id, changes) {
  await assertTable(table);
  const { columns, pk } = await tableMeta(table);
  if (!pk) throw new Error(`Table "${table}" has no primary key; cannot update.`);
  // Never write the PK, identity, or generated columns.
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
    `UPDATE "public".${ident(table)} SET ${setSql}
      WHERE ${ident(pk)} = $${values.length} RETURNING *`,
    values
  );
  return rows[0];
}

async function deleteRecordsImpl(table, ids) {
  await assertTable(table);
  const { pk } = await tableMeta(table);
  if (!pk) throw new Error(`Table "${table}" has no primary key; cannot delete.`);
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const { rows } = await requirePool().query(
    `DELETE FROM "public".${ident(table)}
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
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
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
