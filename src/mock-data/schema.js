/**
 * Mock schema configuration.
 *
 * This mirrors what `information_schema.columns` would give us from PostgreSQL:
 * a flat list of tables and, per table, an array of { column_name, data_type }.
 *
 * Keeping the shape identical to the real catalog means the service layer can
 * later return live metadata without any consumer noticing the difference.
 */

// List of available tables (PostgreSQL: SELECT table_name FROM information_schema.tables)
export const tables = ['customers', 'products', 'orders'];

// Per-table column metadata.
// data_type values use PostgreSQL's vocabulary on purpose so the filter mapper
// can be reused verbatim against real metadata.
export const schemaMetadata = {
  customers: [
    { column_name: 'id', data_type: 'integer' },
    { column_name: 'first_name', data_type: 'character varying' },
    { column_name: 'last_name', data_type: 'character varying' },
    { column_name: 'email', data_type: 'character varying' },
    { column_name: 'is_active', data_type: 'boolean' },
    { column_name: 'created_at', data_type: 'timestamp' },
  ],
  products: [
    { column_name: 'id', data_type: 'integer' },
    { column_name: 'name', data_type: 'character varying' },
    { column_name: 'category', data_type: 'character varying' },
    { column_name: 'price', data_type: 'numeric' },
    { column_name: 'in_stock', data_type: 'boolean' },
    { column_name: 'created_at', data_type: 'timestamp' },
  ],
  orders: [
    { column_name: 'id', data_type: 'integer' },
    { column_name: 'customer_name', data_type: 'character varying' },
    { column_name: 'product_name', data_type: 'character varying' },
    { column_name: 'quantity', data_type: 'integer' },
    { column_name: 'total', data_type: 'numeric' },
    { column_name: 'status', data_type: 'character varying' },
    { column_name: 'order_date', data_type: 'date' },
  ],
};
