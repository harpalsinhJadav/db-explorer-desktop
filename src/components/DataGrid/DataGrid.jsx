import { useCallback, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  Box,
  Paper,
  TextField,
  Button,
  InputAdornment,
  Typography,
  Stack,
} from '@mui/material';
import {
  SearchRounded,
  FileDownloadRounded,
  SyncRounded,
  AddRounded,
  DeleteOutlineRounded,
  RestartAltRounded,
} from '@mui/icons-material';
import {
  defaultColDef,
  buildFieldTypeMap,
  coerceValue,
} from '../../utils/agGridHelpers';
import { PRIMARY_KEY } from '../../services/schemaService';
import RecordFormDialog from '../RecordFormDialog/RecordFormDialog';
import ConfirmDialog from '../ConfirmDialog/ConfirmDialog';

/**
 * Generic AG Grid wrapper with full CRUD.
 *
 * Reads: receives generated columnDefs + rowData.
 * Writes: inline cell editing (update), Add Row dialog (insert), Delete Selected
 *         (delete), Reset Data (re-seed). All mutations are delegated to the
 *         parent via callbacks, which route them through schemaService.
 */
export default function DataGrid({
  columnDefs,
  rowData,
  schema,
  tableName,
  primaryKey = PRIMARY_KEY,
  dataSource = 'mock',
  syncing = false,
  onAddRow,
  onUpdateRow,
  onDeleteRows,
  onResetData,
  onSync,
}) {
  const gridRef = useRef(null);
  const [quickFilter, setQuickFilter] = useState('');
  const [selectedCount, setSelectedCount] = useState(0);
  const [addOpen, setAddOpen] = useState(false);

  // Pending confirmations (null = closed).
  const [pendingEdit, setPendingEdit] = useState(null); // { node, field, oldValue, newValue, row }
  const [pendingDelete, setPendingDelete] = useState(null); // { ids }
  const [busy, setBusy] = useState(false);
  // Guards programmatic setDataValue calls (revert) from re-triggering confirm.
  const editGuard = useRef(false);

  const fieldTypeMap = useMemo(() => buildFieldTypeMap(schema), [schema]);

  // Inject a selection checkbox onto the first column.
  const computedColumnDefs = useMemo(() => {
    if (!columnDefs?.length) return columnDefs;
    return columnDefs.map((col, i) =>
      i === 0
        ? {
            ...col,
            checkboxSelection: true,
            headerCheckboxSelection: true,
            headerCheckboxSelectionFilteredOnly: true,
          }
        : col
    );
  }, [columnDefs]);

  // Quick search across every column.
  const onQuickFilterChange = useCallback((e) => {
    setQuickFilter(e.target.value);
  }, []);

  // CSV export of the currently visible/filtered/sorted rows.
  const onExportCsv = useCallback(() => {
    gridRef.current?.api?.exportDataAsCsv({
      fileName: `${tableName || 'export'}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`,
      allColumns: false,
    });
  }, [tableName]);

  const onSelectionChanged = useCallback(() => {
    setSelectedCount(gridRef.current?.api?.getSelectedRows().length ?? 0);
  }, []);

  // Inline edit committed -> coerce, show it in the cell, then ASK before
  // persisting. Nothing is written to the data source until confirmed.
  const onCellValueChanged = useCallback(
    (params) => {
      if (editGuard.current) return; // ignore our own programmatic reverts
      const field = params.colDef.field;
      const oldValue = params.oldValue;
      const coerced = coerceValue(fieldTypeMap[field], params.newValue);
      if (coerced === oldValue) return; // no real change

      // Reflect the coerced value in the grid while the dialog is open.
      editGuard.current = true;
      params.node.setDataValue(field, coerced);
      editGuard.current = false;

      setPendingEdit({
        node: params.node,
        field,
        oldValue,
        newValue: coerced,
        row: { ...params.node.data },
      });
    },
    [fieldTypeMap]
  );

  const confirmEdit = useCallback(async () => {
    if (!pendingEdit) return;
    setBusy(true);
    try {
      await onUpdateRow?.(pendingEdit.row);
      setPendingEdit(null);
    } finally {
      setBusy(false);
    }
  }, [pendingEdit, onUpdateRow]);

  const cancelEdit = useCallback(() => {
    if (pendingEdit) {
      // Revert the cell to its previous value.
      editGuard.current = true;
      pendingEdit.node.setDataValue(pendingEdit.field, pendingEdit.oldValue);
      editGuard.current = false;
    }
    setPendingEdit(null);
  }, [pendingEdit]);

  const handleDeleteSelected = useCallback(() => {
    const selected = gridRef.current?.api?.getSelectedRows() ?? [];
    if (selected.length === 0) return;
    const ids = selected.map((r) => r[primaryKey]);
    setPendingDelete({ ids });
  }, [primaryKey]);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await onDeleteRows?.(pendingDelete.ids);
      setPendingDelete(null);
    } finally {
      setBusy(false);
    }
  }, [pendingDelete, onDeleteRows]);

  const handleAddSubmit = useCallback(
    async (record) => {
      await onAddRow?.(record);
      setAddOpen(false);
    },
    [onAddRow]
  );

  const gridOptions = useMemo(
    () => ({
      pagination: true,
      paginationPageSize: 20,
      paginationPageSizeSelector: [10, 20, 50, 100],
      multiSortKey: 'ctrl',
      animateRows: true,
      enableCellTextSelection: false,
      // Keep the column header menu icon always visible so the filter/menu is
      // one click away from every column header (incl. id).
      suppressMenuHide: true,
      rowSelection: 'multiple',
      suppressRowClickSelection: true, // select only via checkbox, so editing clicks don't toggle selection
      stopEditingWhenCellsLoseFocus: true,
    }),
    []
  );

  return (
    <Paper
      elevation={1}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1.5}
        alignItems={{ xs: 'stretch', md: 'center' }}
        sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Typography
          variant="subtitle1"
          sx={{ fontWeight: 700, textTransform: 'capitalize', flexGrow: 1 }}
        >
          {tableName}{' '}
          <Typography component="span" variant="body2" color="text.secondary">
            ({rowData.length} rows
            {selectedCount > 0 ? `, ${selectedCount} selected` : ''})
          </Typography>
        </Typography>

        <TextField
          size="small"
          placeholder="Quick search…"
          value={quickFilter}
          onChange={onQuickFilterChange}
          sx={{ minWidth: { md: 220 } }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchRounded fontSize="small" />
              </InputAdornment>
            ),
          }}
        />

        <Button
          variant="contained"
          color="primary"
          startIcon={<AddRounded />}
          onClick={() => setAddOpen(true)}
        >
          Add Row
        </Button>

        <Button
          variant="outlined"
          color="error"
          startIcon={<DeleteOutlineRounded />}
          onClick={handleDeleteSelected}
          disabled={selectedCount === 0}
        >
          Delete{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </Button>

        <Button
          variant="outlined"
          color="secondary"
          startIcon={<SyncRounded />}
          onClick={onSync}
          disabled={syncing}
        >
          {syncing ? 'Syncing…' : 'Sync DB'}
        </Button>

        <Button
          variant="outlined"
          startIcon={<FileDownloadRounded />}
          onClick={onExportCsv}
        >
          Export CSV
        </Button>

        {dataSource === 'mock' && (
          <Button
            variant="text"
            color="inherit"
            startIcon={<RestartAltRounded />}
            onClick={onResetData}
          >
            Reset
          </Button>
        )}
      </Stack>

      {/* Grid */}
      <Box className="ag-theme-quartz" sx={{ flex: 1, width: '100%' }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={computedColumnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={quickFilter}
          gridOptions={gridOptions}
          getRowId={(p) => String(p.data[primaryKey])}
          onCellValueChanged={onCellValueChanged}
          onSelectionChanged={onSelectionChanged}
        />
      </Box>

      <RecordFormDialog
        open={addOpen}
        schema={schema}
        tableName={tableName}
        primaryKey={primaryKey}
        onClose={() => setAddOpen(false)}
        onSubmit={handleAddSubmit}
      />

      <ConfirmDialog
        open={Boolean(pendingEdit)}
        title="Save change?"
        confirmLabel="Save"
        loading={busy}
        onConfirm={confirmEdit}
        onClose={cancelEdit}
        message={
          pendingEdit ? (
            <>
              Update <strong>{pendingEdit.field}</strong> to{' '}
              <strong>{String(pendingEdit.newValue ?? '∅')}</strong> for{' '}
              {primaryKey}={String(pendingEdit.row?.[primaryKey])}? This writes to
              the database.
            </>
          ) : (
            ''
          )
        }
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete rows?"
        confirmLabel="Delete"
        confirmColor="error"
        loading={busy}
        onConfirm={confirmDelete}
        onClose={() => setPendingDelete(null)}
        message={
          pendingDelete
            ? `Permanently delete ${pendingDelete.ids.length} row${
                pendingDelete.ids.length === 1 ? '' : 's'
              } from ${tableName}? This cannot be undone.`
            : ''
        }
      />
    </Paper>
  );
}
