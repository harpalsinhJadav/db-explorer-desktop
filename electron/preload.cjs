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

  getTables: () => call('db:getTables'),
  getTableSchema: (table) => call('db:getTableSchema', table),
  getTableData: (table) => call('db:getTableData', table),

  insertRecord: (table, record) => call('db:insert', table, record),
  updateRecord: (table, id, changes) => call('db:update', table, id, changes),
  deleteRecords: (table, ids) => call('db:delete', table, ids),
});
