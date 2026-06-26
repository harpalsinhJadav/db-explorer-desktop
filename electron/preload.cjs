/**
 * Preload bridge.
 * ---------------
 * Runs in an isolated context with access to Node, and exposes a minimal,
 * safe `window.dbApi` to the renderer via contextBridge. The renderer cannot
 * touch `pg` or `ipcRenderer` directly — only these whitelisted methods.
 *
 * Each call unwraps the { data } / { error } envelope from the main process so
 * the renderer sees a resolved value or a thrown Error with a clean message.
 */
const { contextBridge, ipcRenderer } = require('electron');

async function call(channel, ...args) {
  const res = await ipcRenderer.invoke(channel, ...args);
  if (res && res.error) throw new Error(res.error);
  return res ? res.data : res;
}

contextBridge.exposeInMainWorld('dbApi', {
  // Marker the renderer can check to know it's running inside Electron.
  isElectron: true,

  connect: (config) => call('db:connect', config),
  testConnection: (config) => call('db:test', config),

  getSchemas: () => call('db:getSchemas'),
  getTables: (schema) => call('db:getTables', schema),
  getTableSchema: (schema, table) => call('db:getTableSchema', schema, table),
  getTableData: (schema, table) => call('db:getTableData', schema, table),

  insertRecord: (schema, table, record) => call('db:insert', schema, table, record),
  updateRecord: (schema, table, id, changes) => call('db:update', schema, table, id, changes),
  deleteRecords: (schema, table, ids) => call('db:delete', schema, table, ids),
});
