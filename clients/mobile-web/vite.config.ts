import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

// Bookeeper Neo — Mobile Web (PWA) Vite config.
//
// - Base path '/m/' so the bundle is served from https://<host>/m/ by the Go
//   server via embed.FS (see Phase F).
// - PWA manifest standalone, theme-color matches BookeeperPreset primary.700.
// - Service worker: injectManifest mode → custom SW at src/sw.ts gives us
//   fine control over runtime caching strategies (catalog 7d, covers 30d).
export default defineConfig({
    base: '/m/',
    plugins: [
        vue(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            registerType: 'prompt',
            injectRegister: false,
            manifest: {
                name: 'Bookeeper',
                short_name: 'Bookeeper',
                description: 'Companion mobile per la tua libreria Bookeeper.',
                start_url: '/m/',
                scope: '/m/',
                display: 'standalone',
                orientation: 'portrait',
                background_color: '#10201a',
                theme_color: '#305545',
                lang: 'it-IT',
                icons: [
                    {
                        src: '/m/icons/icon-192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                    {
                        src: '/m/icons/icon-512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                ],
            },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
            },
            devOptions: {
                enabled: false,
                type: 'module',
            },
        }),
    ],
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
            '@desktop-theme': fileURLToPath(
                new URL('../desktop/frontend/src/theme', import.meta.url),
            ),
        },
    },
    server: {
        host: true,
        port: 5174,
    },
    build: {
        target: 'es2022',
        sourcemap: true,
    },
});
