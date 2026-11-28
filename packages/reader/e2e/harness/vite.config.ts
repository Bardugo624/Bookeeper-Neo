import { fileURLToPath } from 'node:url';
import { foliateAssets } from '@bookeeper/reader/vite';
import { defineConfig } from 'vite';

const here = (file: string) => fileURLToPath(new URL(file, import.meta.url));

// The test page: the host page with the Engine, and the engine page (`reader-frame.html`) with the real CSP.
export default defineConfig({
  root: here('.'),
  plugins: [foliateAssets()],
  build: {
    outDir: here('../dist'),
    emptyOutDir: true,
    rollupOptions: { input: { index: here('index.html'), 'reader-frame': here('reader-frame.html') } },
  },
});
