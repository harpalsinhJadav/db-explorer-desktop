import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  InputAdornment,
  IconButton,
  CircularProgress,
  Stack,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  StorageRounded,
} from '@mui/icons-material';
import { useAuthStore } from '../../store/authStore';

/**
 * Login screen.
 * Validation is frontend-only against static credentials (see authService).
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const serverError = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // Already logged in? Skip the form.
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  const validate = () => {
    const errors = {};
    if (!email.trim()) errors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      errors.email = 'Enter a valid email address.';
    if (!password) errors.password = 'Password is required.';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    if (!validate()) return;

    const ok = await login(email, password);
    if (ok) {
      const redirectTo = location.state?.from?.pathname || '/dashboard';
      navigate(redirectTo, { replace: true });
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'linear-gradient(135deg, #1565c0 0%, #00838f 100%)',
        p: 2,
      }}
    >
      <Paper elevation={6} sx={{ p: 4, width: '100%', maxWidth: 420 }}>
        <Stack spacing={1} alignItems="center" mb={2}>
          <StorageRounded color="primary" sx={{ fontSize: 44 }} />
          <Typography variant="h5" fontWeight={700}>
            DB Explorer
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in to access the database dashboard
          </Typography>
        </Stack>

        {serverError && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
            {serverError}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="normal"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={Boolean(fieldErrors.email)}
            helperText={fieldErrors.email}
            autoFocus
            autoComplete="email"
          />
          <TextField
            label="Password"
            type={showPassword ? 'text' : 'password'}
            fullWidth
            margin="normal"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={Boolean(fieldErrors.password)}
            helperText={fieldErrors.password}
            autoComplete="current-password"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((v) => !v)}
                    edge="end"
                    aria-label="toggle password visibility"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            size="large"
            disabled={loading}
            sx={{ mt: 3 }}
            startIcon={
              loading ? <CircularProgress size={18} color="inherit" /> : null
            }
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
        </Box>

        <Box
          sx={{
            mt: 3,
            p: 1.5,
            borderRadius: 1,
            bgcolor: 'grey.100',
            fontSize: 13,
          }}
        >
          <Typography variant="caption" color="text.secondary" component="div">
            <strong>Demo credentials</strong>
          </Typography>
          <Typography variant="caption" color="text.secondary" component="div">
            admin@example.com / admin123
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
