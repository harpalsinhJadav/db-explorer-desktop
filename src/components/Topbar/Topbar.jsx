import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  IconButton,
  Button,
  Avatar,
  Tooltip,
} from '@mui/material';
import {
  MenuRounded,
  LogoutRounded,
  StorageRounded,
  SettingsRounded,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

/**
 * Top application bar: branding, drawer toggle, settings, user and logout.
 */
export default function Topbar({ onToggleSidebar, showMenuButton = true }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        {showMenuButton && (
          <IconButton
            color="inherit"
            edge="start"
            onClick={onToggleSidebar}
            sx={{ mr: 1, display: { md: 'none' } }}
            aria-label="toggle navigation"
          >
            <MenuRounded />
          </IconButton>
        )}

        <StorageRounded sx={{ mr: 1 }} />
        <Typography variant="h6" noWrap sx={{ fontWeight: 700, flexGrow: 1 }}>
          DB Explorer
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Tooltip title="Settings">
            <IconButton
              color="inherit"
              onClick={() => navigate('/settings')}
              aria-label="settings"
            >
              <SettingsRounded />
            </IconButton>
          </Tooltip>
          <Box sx={{ textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
            <Typography variant="body2" sx={{ lineHeight: 1.1 }}>
              {user?.name || 'User'}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.85 }}>
              {user?.email}
            </Typography>
          </Box>
          <Avatar sx={{ bgcolor: 'secondary.main', width: 34, height: 34 }}>
            {(user?.name || 'U').charAt(0).toUpperCase()}
          </Avatar>
          <Tooltip title="Logout">
            <Button
              color="inherit"
              onClick={handleLogout}
              startIcon={<LogoutRounded />}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              Logout
            </Button>
          </Tooltip>
          <IconButton
            color="inherit"
            onClick={handleLogout}
            sx={{ display: { xs: 'inline-flex', sm: 'none' } }}
            aria-label="logout"
          >
            <LogoutRounded />
          </IconButton>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
