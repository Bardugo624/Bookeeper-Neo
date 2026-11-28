import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
// By path, not by package name: Node loads this file as it is and cannot read the package's TypeScript entry.
import { foliateAssets } from '../../packages/reader/src/vite/foliateAssets';

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  // The plugin copies files when a bundle closes, which Vitest does too (into a folder that does not exist).
  plugins: [react(), ...(process.env.VITEST ? [] : [foliateAssets()])],
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The app, and the engine's page (its own CSP, in an iframe).
    rollupOptions: { input: { index: here('index.html'), 'reader-frame': here('reader-frame.html') } },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
