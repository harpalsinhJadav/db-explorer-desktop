/**
 * agGridHelpers
 * -------------
 * Turns schema metadata into AG Grid column definitions. Columns and their
 * filters are generated entirely from { column_name, data_type } — no per-table
 * configuration exists anywhere.
 */

import { buildFilterConfig } from './filterMapper';
import { PRIMARY_KEY } from '../mock-data/mockDb';

/**
 * Determine a table's primary key column from its schema.
 * Prefers a column flagged `primary_key` (from Supabase introspection), then a
 * conventional `id`, then the first column.
 */
export function findPrimaryKey(schema) {
  if (!Array.isArray(schema) || schema.length === 0) return PRIMARY_KEY;
  const flagged = schema.find((c) => c.primary_key);
  if (flagged) return flagged.column_name;
  if (schema.some((c) => c.column_name === PRIMARY_KEY)) return PRIMARY_KEY;
  return schema[0].column_name;
}

// Turn snake_case column names into a friendlier header label.
function toHeaderName(columnName) {
  return columnName
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Format values for display based on data type (boolean -> Yes/No, etc.).
function valueFormatterFor(dataType) {
  const t = (dataType || '').toLowerCase();

  if (t === 'boolean') {
    return (params) =>
      params.value === true || params.value === 'true'
        ? 'Yes'
        : params.value == null
          ? ''
          : 'No';
  }

  if (t.includes('timestamp')) {
    return (params) => {
      if (!params.value) return '';
      const d = new Date(params.value);
      return Number.isNaN(d.getTime()) ? params.value : d.toLocaleString();
    };
  }

  if (t === 'date') {
    return (params) => {
      if (!params.value) return '';
      const d = new Date(params.value);
      return Number.isNaN(d.getTime()) ? params.value : d.toLocaleDateString();
    };
  }

  return undefined;
}

/**
 * Build AG Grid columnDefs from schema metadata.
 *
 * @param {Array<{column_name:string,data_type:string}>} schema
 * @param {string} [primaryKey] the PK column (not editable); auto-detected if omitted
 * @returns {Array<object>} AG Grid column definitions
 */
export function buildColumnDefs(schema, primaryKey = findPrimaryKey(schema)) {
  if (!Array.isArray(schema)) return [];

  return schema.map((col) => {
    const formatter = valueFormatterFor(col.data_type);
    const isPrimaryKey = col.column_name === primaryKey;
    const t = (col.data_type || '').toLowerCase();

    const enumValues = Array.isArray(col.enum_values) ? col.enum_values : null;
    // Generated/identity columns are read-only; PK is read-only too.
    const editable = !isPrimaryKey && !col.is_generated && !col.is_identity;

    const def = {
      field: col.column_name,
      headerName: toHeaderName(col.column_name),
      // Dynamic, data-type-driven filter (see filterMapper).
      ...buildFilterConfig(col.data_type),
      ...(formatter ? { valueFormatter: formatter } : {}),
      editable,
    };

    // Pick an appropriate inline editor per data type.
    if (editable) {
      if (enumValues) {
        // Postgres enum -> dropdown of its allowed labels.
        def.cellEditor = 'agSelectCellEditor';
        def.cellEditorParams = { values: enumValues };
      } else if (t === 'boolean') {
        def.cellEditor = 'agSelectCellEditor';
        def.cellEditorParams = { values: ['true', 'false'] };
      } else if (t.includes('char') || t === 'text') {
        def.cellEditor = 'agLargeTextCellEditor';
        def.cellEditorPopup = true;
        def.cellEditorParams = { maxLength: 1000, rows: 3, cols: 40 };
      }
    }

    return def;
  });
}

/**
 * Coerce a raw cell/form value into the correct JS type for its column, so the
 * data layer (and a future SQL backend) receives properly typed values rather
 * than the strings that inputs/editors produce.
 *
 * @param {string} dataType  PostgreSQL data type
 * @param {*} value          raw value from an editor or form field
 */
export function coerceValue(dataType, value) {
  if (value === '' || value === undefined || value === null) return null;
  const t = (dataType || '').toLowerCase();

  if (t === 'integer' || t === 'bigint' || t === 'smallint') {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  if (t === 'numeric' || t === 'decimal' || t.includes('double') || t === 'real') {
    const n = parseFloat(value);
    return Number.isNaN(n) ? null : n;
  }
  if (t === 'boolean') {
    return value === true || value === 'true';
  }
  // text, varchar, date, timestamp -> keep as-is (ISO strings for dates)
  return value;
}

/**
 * Build a quick lookup of column_name -> data_type from schema metadata.
 */
export function buildFieldTypeMap(schema) {
  const map = {};
  (schema || []).forEach((c) => {
    map[c.column_name] = c.data_type;
  });
  return map;
}

/**
 * Default column behaviour shared by every generated column:
 * sortable, filterable, resizable, hide/show via the columns tool panel menu.
 */
export const defaultColDef = {
  sortable: true,
  filter: true,
  resizable: true,
  // Enables the "hide/show columns" + filter tabs in the column header menu.
  menuTabs: ['filterMenuTab', 'generalMenuTab'],
  minWidth: 120,
  flex: 1,
};
