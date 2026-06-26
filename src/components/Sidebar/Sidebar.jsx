import {
  Drawer,
  Toolbar,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
  Box,
  Divider,
  Skeleton,
  CircularProgress,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
} from '@mui/material';
import { TableChartRounded, SchemaRounded } from '@mui/icons-material';

const DRAWER_WIDTH = 260;

/**
 * Sidebar with a schema selector dropdown and the dynamic table list.
 * Schema and table data are loaded by Dashboard and passed down here.
 */
export default function Sidebar({
  schemas,
  schemasLoading,
  selectedSchema,
  onSelectSchema,
  tables,
  loading,
  selectedTable,
  onSelectTable,
  mobileOpen,
  onClose,
}) {
  const content = (
    <>
      <Toolbar />

      {/* Schema selector */}
      <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
        <FormControl fullWidth size="small" disabled={schemasLoading}>
          <InputLabel id="schema-select-label">Schema</InputLabel>
          <Select
            labelId="schema-select-label"
            value={schemasLoading ? '' : selectedSchema}
            label="Schema"
            onChange={(e) => onSelectSchema(e.target.value)}
            startAdornment={
              <SchemaRounded sx={{ mr: 0.5, fontSize: 18, color: 'text.secondary' }} />
            }
          >
            {schemas.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box sx={{ px: 2, pb: 1 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ fontWeight: 700, letterSpacing: 1 }}
        >
          Tables
        </Typography>
      </Box>
      <Divider />

      {loading ? (
        <Box sx={{ p: 2 }}>
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} height={40} sx={{ mb: 1 }} />
          ))}
        </Box>
      ) : (
        <List sx={{ px: 1 }}>
          {tables.map((table) => (
            <ListItemButton
              key={table}
              selected={selectedTable === table}
              onClick={() => onSelectTable(table)}
              sx={{ borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>
                <TableChartRounded
                  fontSize="small"
                  color={selectedTable === table ? 'primary' : 'inherit'}
                />
              </ListItemIcon>
              <ListItemText
                primary={table}
                primaryTypographyProps={{
                  fontWeight: selectedTable === table ? 700 : 400,
                  textTransform: 'capitalize',
                }}
              />
            </ListItemButton>
          ))}
          {tables.length === 0 && !loading && (
            <Box sx={{ p: 2 }}>
              <Typography variant="body2" color="text.secondary">
                No tables found in this schema.
              </Typography>
            </Box>
          )}
        </List>
      )}
    </>
  );

  return (
    <Box
      component="nav"
      sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}
    >
      {/* Mobile: temporary drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: DRAWER_WIDTH,
          },
        }}
      >
        {content}
      </Drawer>

      {/* Desktop: permanent drawer */}
      <Drawer
        variant="permanent"
        open
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': {
            boxSizing: 'border-box',
            width: DRAWER_WIDTH,
          },
        }}
      >
        {content}
      </Drawer>
    </Box>
  );
}

export { DRAWER_WIDTH };
