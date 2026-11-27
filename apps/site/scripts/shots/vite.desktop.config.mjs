// Runs the desktop frontend (apps/desktop) in a plain browser, same-origin with a bookeeper-server
// through a dev proxy (the server sends no CORS headers). The repo's own vite config is untouched.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('../../../desktop', import.meta.url));
const target = process.env.BOOKEEPER_SERVER ?? 'http://127.0.0.1:7842';

export default defineConfig({
  root,
  plugins: [react()],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  server: { port: 5173, strictPort: true, proxy: { '/api': { target, changeOrigin: true } } },
});
