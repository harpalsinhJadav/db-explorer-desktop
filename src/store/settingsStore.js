import { create } from 'zustand';

/**
 * settingsStore
 * -------------
 * Holds the configured data source.
 *
 *   dataSource: 'mock'     -> the in-browser localStorage mock database
 *   dataSource: 'postgres' -> a real PostgreSQL server, reached through the
 *                             Electron main process (node-postgres over IPC).
 *
 * The Postgres option only works when running inside the Electron app, because
 * a browser cannot open a raw TCP connection to Postgres. schemaService reads
 * this store at call time, so switching the source takes effect immediately.
 */

const STORAGE_KEY = 'db-explorer.settings';

const defaults = {
  dataSource: 'mock', // 'mock' | 'postgres'
  pg: {
    // A full connection string takes precedence when set, e.g.
    //   postgresql://user:pass@host:5432/dbname
    connectionString: '',
    host: 'localhost',
    port: '5432',
    database: '',
    user: '',
    password: '',
    ssl: false,
  },
};

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      ...defaults,
      ...parsed,
      pg: { ...defaults.pg, ...(parsed.pg || {}) },
    };
  } catch {
    return defaults;
  }
}

function pickConfig(state) {
  return { dataSource: state.dataSource, pg: state.pg };
}

export const useSettingsStore = create((set, get) => ({
  ...loadPersisted(),

  /** Persist a partial config update to localStorage and state. */
  save(partial) {
    set(partial);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pickConfig(get())));
  },
}));

/** Non-React accessor used by the service layer. */
export const getSettings = () => pickConfig(useSettingsStore.getState());
