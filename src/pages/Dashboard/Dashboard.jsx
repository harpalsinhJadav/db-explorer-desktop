import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Toolbar,
  Alert,
  Snackbar,
  CircularProgress,
  Typography,
} from '@mui/material';
import { TableViewRounded } from '@mui/icons-material';
import Topbar from '../../components/Topbar/Topbar';
import Sidebar from '../../components/Sidebar/Sidebar';
import DataGrid from '../../components/DataGrid/DataGrid';
import { schemaService } from '../../services/schemaService';
import { buildColumnDefs, findPrimaryKey } from '../../utils/agGridHelpers';
import { useSettingsStore } from '../../store/settingsStore';

/**
 * Dashboard
 * ---------
 * Orchestrates the explorer:
 *   1. loads the table list (sidebar)
 *   2. on table selection: loads schema -> builds columns -> loads data
 *   3. renders a single, generic DataGrid that supports full CRUD
 *
 * All data access (reads and writes) goes through schemaService, so nothing
 * here knows or cares whether the data is mock or a real API.
 */
export default function Dashboard() {
  const [tables, setTables] = useState([]);
  const [tablesLoading, setTablesLoading] = useState(true);

  const [selectedTable, setSelectedTable] = useState(null);
  const [schema, setSchema] = useState([]);
  const [primaryKey, setPrimaryKey] = useState(null);
  const [columnDefs, setColumnDefs] = useState([]);
  const [rowData, setRowData] = useState([]);
  const [tableLoading, setTableLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null); // { severity, message }
  const [syncing, setSyncing] = useState(false);

  const [mobileOpen, setMobileOpen] = useState(false);

  // Which backend is active (mock vs live PostgreSQL) — configured in Settings.
  const dataSource = useSettingsStore((s) => s.dataSource);

  const notify = useCallback(
    (message, severity = 'success') => setToast({ message, severity }),
    []
  );

  // 1. Load the list of tables once on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setTablesLoading(true);
        const list = await schemaService.getTables();
        if (!active) return;
        setTables(list);
        if (list.length > 0) setSelectedTable(list[0]);
      } catch (err) {
        if (active) setError(err.message || 'Failed to load tables.');
      } finally {
        if (active) setTablesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Reusable loader: schema -> columns -> data for the current table.
  const loadTable = useCallback(async (table, { withSchema = true } = {}) => {
    setTableLoading(true);
    setError(null);
    try {
      if (withSchema) {
        const tableSchema = await schemaService.getTableSchema(table);
        const pk = findPrimaryKey(tableSchema);
        setSchema(tableSchema);
        setPrimaryKey(pk);
        setColumnDefs(buildColumnDefs(tableSchema, pk));
      }
      const data = await schemaService.getTableData(table);
      setRowData(data);
    } catch (err) {
      setError(err.message || 'Failed to load table.');
      setColumnDefs([]);
      setRowData([]);
    } finally {
      setTableLoading(false);
    }
  }, []);

  // 2 + 3. Load whenever the selected table changes.
  useEffect(() => {
    if (selectedTable) loadTable(selectedTable);
  }, [selectedTable, loadTable]);

  const handleSelectTable = useCallback((table) => {
    setSelectedTable(table);
    setMobileOpen(false);
  }, []);

  // ---- CRUD handlers -------------------------------------------------------

  const handleAddRow = useCallback(
    async (record) => {
      try {
        await schemaService.insertRecord(selectedTable, record);
        await loadTable(selectedTable, { withSchema: false });
        notify('Row added.');
      } catch (err) {
        notify(err.message || 'Failed to add row.', 'error');
        throw err; // let the dialog stay open on failure
      }
    },
    [selectedTable, loadTable, notify]
  );

  const handleUpdateRow = useCallback(
    async (row) => {
      try {
        // The grid already shows the new value; just persist it.
        await schemaService.updateRecord(selectedTable, row[primaryKey], row);
        notify('Row updated.');
      } catch (err) {
        notify(err.message || 'Failed to update row.', 'error');
        // Revert by reloading from the source of truth.
        await loadTable(selectedTable, { withSchema: false });
      }
    },
    [selectedTable, loadTable, notify, primaryKey]
  );

  const handleDeleteRows = useCallback(
    async (ids) => {
      try {
        const count = await schemaService.deleteRecords(selectedTable, ids);
        await loadTable(selectedTable, { withSchema: false });
        notify(`Deleted ${count} row${count === 1 ? '' : 's'}.`);
      } catch (err) {
        notify(err.message || 'Failed to delete rows.', 'error');
      }
    },
    [selectedTable, loadTable, notify]
  );

  const handleResetData = useCallback(async () => {
    try {
      await schemaService.resetTable(selectedTable);
      await loadTable(selectedTable, { withSchema: false });
      notify('Table reset to seed data.');
    } catch (err) {
      notify(err.message || 'Failed to reset table.', 'error');
    }
  }, [selectedTable, loadTable, notify]);

  // Re-fetch everything from the active data source: table list + current
  // table's schema and rows. This is what makes a config change in Settings
  // take effect against the live database on demand.
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const list = await schemaService.getTables();
      setTables(list);
      const table = list.includes(selectedTable) ? selectedTable : list[0];
      if (table !== selectedTable) {
        setSelectedTable(table); // selection change triggers a full reload
      } else if (table) {
        await loadTable(table); // reload schema + data for the same table
      }
      notify('Synced with data source.');
    } catch (err) {
      notify(err.message || 'Sync failed.', 'error');
    } finally {
      setSyncing(false);
    }
  }, [selectedTable, loadTable, notify]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Topbar onToggleSidebar={() => setMobileOpen((v) => !v)} />

      <Sidebar
        tables={tables}
        loading={tablesLoading}
        selectedTable={selectedTable}
        onSelectTable={handleSelectTable}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { md: `calc(100% - 260px)` },
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          bgcolor: 'background.default',
        }}
      >
        <Toolbar />
        <Box sx={{ flex: 1, p: 2, minHeight: 0 }}>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          {tableLoading ? (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.secondary',
              }}
            >
              <CircularProgress />
              <Typography>Loading {selectedTable}…</Typography>
            </Box>
          ) : selectedTable ? (
            <DataGrid
              columnDefs={columnDefs}
              rowData={rowData}
              schema={schema}
              tableName={selectedTable}
              primaryKey={primaryKey}
              dataSource={dataSource}
              syncing={syncing}
              onAddRow={handleAddRow}
              onUpdateRow={handleUpdateRow}
              onDeleteRows={handleDeleteRows}
              onResetData={handleResetData}
              onSync={handleSync}
            />
          ) : (
            <Box
              sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                alignItems: 'center',
                justifyContent: 'center',
                color: 'text.secondary',
              }}
            >
              <TableViewRounded sx={{ fontSize: 64, opacity: 0.4 }} />
              <Typography variant="h6">Select a table to begin</Typography>
              <Typography variant="body2">
                Pick a table from the sidebar to explore its data.
              </Typography>
            </Box>
          )}
        </Box>
      </Box>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert
            severity={toast.severity}
            onClose={() => setToast(null)}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
