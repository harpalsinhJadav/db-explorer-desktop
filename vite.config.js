import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Electron loads index.html via file:// and needs a relative base ('./').
  // A hosted website (Vercel/Netlify) with client-side routing needs an
  // absolute base ('/') so assets resolve on deep links like /dashboard.
  // `npm run build:web` sets BUILD_TARGET=web to switch.
  base: process.env.BUILD_TARGET === 'web' ? '/' : './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Electron opens the window; don't also open a browser tab.
    open: false,
  },
});
