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
} from '@mui/material';
import { TableChartRounded } from '@mui/icons-material';

const DRAWER_WIDTH = 260;

/**
 * Sidebar with the dynamic table list (loaded from schemaService by the
 * Dashboard and passed down here). Clicking a table notifies the parent.
 */
export default function Sidebar({
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
      <Box sx={{ px: 2, py: 1.5 }}>
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
          {tables.length === 0 && (
            <Box sx={{ p: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                No tables found
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
