import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // In dev the API lives on the Bookeeper server (default port 7842), not on Vite.
  server: { port: 5174, strictPort: true, proxy: { '/api': 'http://localhost:7842' } },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
