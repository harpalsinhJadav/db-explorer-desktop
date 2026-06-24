import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Toolbar,
  Paper,
  Typography,
  RadioGroup,
  FormControlLabel,
  Radio,
  TextField,
  Switch,
  Button,
  Stack,
  Divider,
  Alert,
  AlertTitle,
  Grid,
  Chip,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import {
  ArrowBackRounded,
  SaveRounded,
  WifiTetheringRounded,
} from '@mui/icons-material';
import Topbar from '../../components/Topbar/Topbar';
import { useSettingsStore } from '../../store/settingsStore';
import { schemaService } from '../../services/schemaService';

/**
 * Settings page — configure the data source.
 *
 * Choose between the offline mock database and a real PostgreSQL server. The
 * Postgres connection is made by the Electron main process (node-postgres), so
 * it works with ANY Postgres — direct or pooled, local or remote.
 *
 * Saving updates the settings store; because schemaService reads that store on
 * every call, the dashboard picks up the new source immediately (and "Sync DB"
 * re-fetches from it).
 */
export default function Settings() {
  const navigate = useNavigate();
  const store = useSettingsStore();

  const [dataSource, setDataSource] = useState(store.dataSource);
  const [pg, setPg] = useState(store.pg);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { ok, message }
  const [toast, setToast] = useState(null);

  const isPostgres = dataSource === 'postgres';
  const inElectron = typeof window !== 'undefined' && Boolean(window.dbApi);

  const setField = (field, value) =>
    setPg((prev) => ({ ...prev, [field]: value }));

  const persist = () => store.save({ dataSource, pg });

  const handleSave = () => {
    persist();
    setToast('Settings saved. The dashboard now uses this data source.');
  };

  const handleTest = async () => {
    persist();
    setTesting(true);
    setTestResult(null);
    try {
      const result = await schemaService.testConnection();
      setTestResult({
        ok: result?.ok ?? true,
        message: result?.message || 'Connection succeeded.',
      });
    } catch (err) {
      setTestResult({ ok: false, message: err.message || 'Connection failed.' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Topbar showMenuButton={false} />
      <Toolbar />

      <Box sx={{ maxWidth: 760, mx: 'auto', p: { xs: 2, sm: 3 } }}>
        <Stack direction="row" alignItems="center" spacing={1} mb={2}>
          <Button
            startIcon={<ArrowBackRounded />}
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </Button>
          <Typography variant="h5" sx={{ fontWeight: 700, ml: 1 }}>
            Settings
          </Typography>
        </Stack>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Data Source
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Choose where the dashboard reads and writes data. Switching takes
            effect immediately for the next load or sync.
          </Typography>

          <RadioGroup
            value={dataSource}
            onChange={(e) => setDataSource(e.target.value)}
          >
            <FormControlLabel
              value="mock"
              control={<Radio />}
              label="Mock data (offline, stored in this browser)"
            />
            <FormControlLabel
              value="postgres"
              control={<Radio />}
              label="PostgreSQL (any server — direct connection)"
            />
          </RadioGroup>

          {isPostgres && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                PostgreSQL Connection
              </Typography>

              {!inElectron && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <AlertTitle>Open the desktop app</AlertTitle>
                  Direct Postgres connections only work in the Electron app (the
                  Node process makes the connection). Run <code>npm run dev</code>{' '}
                  and use the desktop window — a plain browser tab cannot connect.
                </Alert>
              )}

              <Stack spacing={2}>
                <TextField
                  label="Connection String (optional)"
                  placeholder="postgresql://user:password@host:5432/dbname"
                  value={pg.connectionString}
                  onChange={(e) => setField('connectionString', e.target.value)}
                  fullWidth
                  size="small"
                  helperText="If set, this is used and the fields below are ignored. Works with pooler URLs too."
                />

                <Divider flexItem>
                  <Typography variant="caption" color="text.secondary">
                    or individual fields
                  </Typography>
                </Divider>

                <Grid container spacing={2}>
                  <Grid item xs={12} sm={8}>
                    <TextField
                      label="Host"
                      value={pg.host}
                      onChange={(e) => setField('host', e.target.value)}
                      fullWidth
                      size="small"
                      disabled={Boolean(pg.connectionString)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <TextField
                      label="Port"
                      value={pg.port}
                      onChange={(e) => setField('port', e.target.value)}
                      fullWidth
                      size="small"
                      disabled={Boolean(pg.connectionString)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Database"
                      value={pg.database}
                      onChange={(e) => setField('database', e.target.value)}
                      fullWidth
                      size="small"
                      disabled={Boolean(pg.connectionString)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="User"
                      value={pg.user}
                      onChange={(e) => setField('user', e.target.value)}
                      fullWidth
                      size="small"
                      disabled={Boolean(pg.connectionString)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      label="Password"
                      type="password"
                      value={pg.password}
                      onChange={(e) => setField('password', e.target.value)}
                      fullWidth
                      size="small"
                      disabled={Boolean(pg.connectionString)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <FormControlLabel
                      sx={{ mt: 0.5 }}
                      control={
                        <Switch
                          checked={Boolean(pg.ssl)}
                          onChange={(e) => setField('ssl', e.target.checked)}
                        />
                      }
                      label="Use SSL"
                    />
                  </Grid>
                </Grid>
              </Stack>

              {testResult && (
                <Alert
                  severity={testResult.ok ? 'success' : 'error'}
                  sx={{ mt: 2 }}
                  onClose={() => setTestResult(null)}
                >
                  {testResult.message}
                </Alert>
              )}
            </>
          )}

          <Divider sx={{ my: 3 }} />

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ sm: 'center' }}
          >
            <Chip
              label={isPostgres ? 'Active: PostgreSQL' : 'Active: Mock data (offline)'}
              color={isPostgres ? 'secondary' : 'default'}
              variant="outlined"
            />
            <Box sx={{ flexGrow: 1 }} />
            {isPostgres && (
              <Button
                variant="outlined"
                startIcon={
                  testing ? <CircularProgress size={16} /> : <WifiTetheringRounded />
                }
                onClick={handleTest}
                disabled={testing || !inElectron}
              >
                Test Connection
              </Button>
            )}
            <Button
              variant="contained"
              startIcon={<SaveRounded />}
              onClick={handleSave}
            >
              Save
            </Button>
          </Stack>
        </Paper>
      </Box>

      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={3000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast ? (
          <Alert severity="success" variant="filled" onClose={() => setToast(null)}>
            {toast}
          </Alert>
        ) : undefined}
      </Snackbar>
    </Box>
  );
}
