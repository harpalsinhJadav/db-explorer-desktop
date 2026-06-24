/**
 * mockDb
 * ------
 * A tiny client-side "database" that stands in for PostgreSQL while there is no
 * backend. It seeds from the bundled JSON files on first use and persists every
 * write to localStorage, so inserts/updates/deletes survive a page refresh and
 * the app behaves like it's talking to a real, mutable database.
 *
 * Only schemaService touches this module. When a real API is wired in, the
 * service methods stop calling mockDb and call HTTP instead — nothing else
 * changes.
 */

import { tables, schemaMetadata } from './schema';
import customers from './customers.json';
import products from './products.json';
import orders from './orders.json';

// Seed datasets, used the first time a table is read (or after a reset).
const seeds = { customers, products, orders };

const STORAGE_PREFIX = 'db-explorer.table.';

// Every mock table uses `id` as its integer primary key.
export const PRIMARY_KEY = 'id';

function storageKey(table) {
  return STORAGE_PREFIX + table;
}

function persist(table, rows) {
  localStorage.setItem(storageKey(table), JSON.stringify(rows));
}

/**
 * Read rows for a table, seeding + persisting from JSON on first access.
 * Returns the live persisted array (already parsed).
 */
function read(table) {
  if (!schemaMetadata[table]) {
    throw new Error(`Unknown table: ${table}`);
  }
  try {
    const raw = localStorage.getItem(storageKey(table));
    if (raw) return JSON.parse(raw);
  } catch {
    // Corrupted storage — fall through to re-seed.
  }
  const seeded = (seeds[table] || []).map((row) => ({ ...row }));
  persist(table, seeded);
  return seeded;
}

function nextId(rows) {
  return rows.reduce((max, r) => Math.max(max, Number(r[PRIMARY_KEY]) || 0), 0) + 1;
}

export const mockDb = {
  /** All available table names. */
  listTables() {
    return [...tables];
  },

  /** Column metadata for a table. */
  schema(table) {
    const schema = schemaMetadata[table];
    if (!schema) throw new Error(`Unknown table: ${table}`);
    return schema.map((c) => ({ ...c }));
  },

  /** Defensive copy of all rows. */
  getRows(table) {
    return read(table).map((r) => ({ ...r }));
  },

  /** Insert a row, auto-assigning the primary key. Returns the created row. */
  insert(table, record) {
    const rows = read(table);
    const created = { ...record, [PRIMARY_KEY]: nextId(rows) };
    rows.push(created);
    persist(table, rows);
    return { ...created };
  },

  /** Update the row whose PK matches. Returns the updated row. */
  update(table, id, changes) {
    const rows = read(table);
    const idx = rows.findIndex((r) => String(r[PRIMARY_KEY]) === String(id));
    if (idx === -1) throw new Error(`Row ${id} not found in ${table}`);
    // Never let the primary key be overwritten.
    rows[idx] = { ...rows[idx], ...changes, [PRIMARY_KEY]: rows[idx][PRIMARY_KEY] };
    persist(table, rows);
    return { ...rows[idx] };
  },

  /** Delete rows by primary key. Returns the number of rows removed. */
  remove(table, ids) {
    const idSet = new Set(ids.map(String));
    const rows = read(table);
    const kept = rows.filter((r) => !idSet.has(String(r[PRIMARY_KEY])));
    persist(table, kept);
    return rows.length - kept.length;
  },

  /** Discard local changes for a table and re-seed from the bundled JSON. */
  reset(table) {
    const seeded = (seeds[table] || []).map((row) => ({ ...row }));
    persist(table, seeded);
    return seeded.map((r) => ({ ...r }));
  },
};
