import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
//
// Nota su `resolve.alias` per chart.js / @primeuix/themes:
// questo workspace e' parte di npm workspaces (vedi root package.json) e
// alcune dipendenze di primevue (in particolare `primevue` stesso) finiscono
// hoisted al `<repo-root>/node_modules`. Quando Rollup risolve gli import
// dinamici interni di primevue (es. `primevue/chart` → `chart.js/auto`)
// parte dalla folder hoisted e Node lookup risale solo sui parent: la
// `chart.js` rimasta nel workspace locale non viene mai trovata.
// Allineiamo esplicitamente questi pacchetti al locale per disambiguare.
const localPkg = (p: string): string =>
  fileURLToPath(new URL(`./node_modules/${p}`, import.meta.url))

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // Subpath PRIMA del bare specifier altrimenti il pattern bare matcha
      // anche `chart.js/auto` per via del prefix-match implicito.
      { find: 'chart.js/auto', replacement: localPkg('chart.js/auto/auto.js') },
      { find: /^chart\.js$/, replacement: localPkg('chart.js/dist/chart.js') },
    ],
    // Deduplica i pacchetti che hanno stato globale (Vue 3, primevue) o che
    // sono fonte di duplicazioni nel monorepo: garantisce che venga sempre
    // usata la stessa istanza indipendentemente da dove venga richiesta.
    dedupe: ['vue', 'primevue', '@primeuix/themes', 'chart.js'],
  },
  optimizeDeps: {
    // Pre-bundle esplicito di chart.js per evitare che il dev server provi
    // a risolverlo lazily al primo import dinamico (stesso problema del build).
    include: ['chart.js/auto'],
  },
})
