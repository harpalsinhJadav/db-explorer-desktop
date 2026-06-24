/**
 * schemaService
 * -------------
 * The single seam between the UI and the data source.
 *
 * It dispatches every call to one of two interchangeable backends based on the
 * configured data source (see settingsStore):
 *
 *   'mock'     -> the in-browser localStorage database (mockDb)
 *   'postgres' -> a real PostgreSQL server via the Electron main process
 *                 (node-postgres over IPC, exposed as window.dbApi)
 *
 * Both backends implement the same interface, so UI components never change —
 * flipping the data source in Settings is enough to go live.
 */

import { mockDb, PRIMARY_KEY } from '../mock-data/mockDb';
import { getSettings } from '../store/settingsStore';

export { PRIMARY_KEY };

// Simulate network latency so the mock backend behaves like a real database.
const delay = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Mock backend — localStorage-backed, always available offline.
// ---------------------------------------------------------------------------
const mockBackend = {
  async getTables() {
    await delay();
    return mockDb.listTables();
  },
  async getTableSchema(table) {
    await delay();
    return mockDb.schema(table);
  },
  async getTableData(table) {
    await delay();
    return mockDb.getRows(table);
  },
  async insertRecord(table, record) {
    await delay();
    return mockDb.insert(table, record);
  },
  async updateRecord(table, id, changes) {
    await delay();
    return mockDb.update(table, id, changes);
  },
  async deleteRecords(table, ids) {
    await delay();
    return mockDb.remove(table, ids);
  },
  async resetTable(table) {
    await delay();
    return mockDb.reset(table);
  },
  async testConnection() {
    await delay(200);
    return { ok: true, message: 'Mock data source is always available.' };
  },
};

// ---------------------------------------------------------------------------
// Postgres backend — real PostgreSQL via the Electron main process.
//
// window.dbApi is injected by electron/preload.cjs. When the app runs in a
// plain browser (no Electron), it is undefined and we surface a clear error.
// ---------------------------------------------------------------------------
function dbApi() {
  if (typeof window === 'undefined' || !window.dbApi) {
    throw new Error(
      'PostgreSQL mode requires the Electron app. Run "npm run dev" (or the packaged app), not a browser tab.'
    );
  }
  return window.dbApi;
}

// Open / reuse the connection. We only (re)connect when the saved config
// changes, so normal reads don't reconnect every call.
let lastConnectedKey = null;
async function ensureConnected() {
  const { pg } = getSettings();
  const key = JSON.stringify(pg);
  if (key !== lastConnectedKey) {
    await dbApi().connect(pg);
    lastConnectedKey = key;
  }
}

const postgresBackend = {
  async getTables() {
    await ensureConnected();
    return dbApi().getTables();
  },
  async getTableSchema(table) {
    await ensureConnected();
    return dbApi().getTableSchema(table);
  },
  async getTableData(table) {
    await ensureConnected();
    return dbApi().getTableData(table);
  },
  async insertRecord(table, record) {
    await ensureConnected();
    return dbApi().insertRecord(table, record);
  },
  async updateRecord(table, id, changes) {
    await ensureConnected();
    return dbApi().updateRecord(table, id, changes);
  },
  async deleteRecords(table, ids) {
    await ensureConnected();
    return dbApi().deleteRecords(table, ids);
  },
  async resetTable() {
    throw new Error('Reset is only available for the mock data source.');
  },
  async testConnection() {
    // Force a fresh connect with the current config.
    lastConnectedKey = null;
    const { pg } = getSettings();
    const result = await dbApi().testConnection(pg);
    lastConnectedKey = JSON.stringify(pg);
    return result;
  },
};

// Resolve the active backend at call time so source changes apply immediately.
function backend() {
  return getSettings().dataSource === 'postgres' ? postgresBackend : mockBackend;
}

export const schemaService = {
  getTables: (...args) => backend().getTables(...args),
  getTableSchema: (...args) => backend().getTableSchema(...args),
  getTableData: (...args) => backend().getTableData(...args),
  insertRecord: (...args) => backend().insertRecord(...args),
  updateRecord: (...args) => backend().updateRecord(...args),
  deleteRecords: (...args) => backend().deleteRecords(...args),
  resetTable: (...args) => backend().resetTable(...args),
  testConnection: (...args) => backend().testConnection(...args),
};
