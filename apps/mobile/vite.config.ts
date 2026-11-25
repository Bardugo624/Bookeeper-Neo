import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/** A color of the design tokens (`--bk-<name>`), first definition (light theme). */
function token(name: string): string {
  const css = readFileSync(fileURLToPath(new URL('../../packages/ui/src/tokens.css', import.meta.url)), 'utf8');
  const hit = new RegExp(`--bk-${name}:\\s*(#[0-9a-f]{3,8})`, 'i').exec(css);
  if (!hit) throw new Error(`token --bk-${name} not found`);
  return hit[1]!;
}

const BACKGROUND = token('neutral-50');
const THEME = token('primary-600');

/** Colors of the browser chrome, from the same tokens as the app. */
const themeColor = (): Plugin => ({
  name: 'bookeeper-theme-color',
  transformIndexHtml: () => [{ tag: 'meta', attrs: { name: 'theme-color', content: THEME }, injectTo: 'head' }],
});

export default defineConfig({
  plugins: [
    react(),
    themeColor(),
    // The workspace hoists Vite 5 for the 0.3 client; the app and the plugin run on Vite 7.
    VitePWA({
      // "Prompt": a new version waits until the user taps "Aggiorna".
      registerType: 'prompt',
      manifest: {
        name: 'Bookeeper',
        short_name: 'Bookeeper',
        description: 'La tua libreria, in tasca.',
        lang: 'it',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        theme_color: THEME,
        background_color: BACKGROUND,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell only. The API is never cached: no runtime caching at all.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/(?:index\.html)?$/],
        cleanupOutdatedCaches: true,
      },
    }) as unknown as Plugin,
  ],
  // In dev the API lives on the Bookeeper server (default port 7842), not on Vite.
  server: { port: 5174, strictPort: true, proxy: { '/api': 'http://localhost:7842' } },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
  },
});
