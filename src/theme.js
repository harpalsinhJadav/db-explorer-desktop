import { createTheme } from '@mui/material/styles';

// Central MUI theme. Tweak palette / typography here to re-skin the whole app.
const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#1565c0' },
    secondary: { main: '#00838f' },
    background: { default: '#f4f6f8' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'Roboto, system-ui, -apple-system, "Segoe UI", sans-serif',
  },
});

export default theme;
