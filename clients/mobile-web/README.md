# clients/mobile-web

PWA companion mobile per Bookeeper Neo. Servita dal server Go via `embed.FS`
sotto `https://<host>/m/`. Stack:

- Vue 3.5 + TypeScript + Vite 5
- PrimeVue (Aura preset, **riusato** dal client desktop via path alias `@desktop-theme`)
- Pinia, vue-router (history mode, base `/m/`)
- vite-plugin-pwa (workbox `injectManifest`)

## Sviluppo locale

```bash
# Dalla root del repo (npm workspaces)
npm install
npm run dev:mobile        # http://localhost:5174/m/

# Oppure dentro al package
cd clients/mobile-web
npm install
npm run dev
```

Backend Go deve girare in parallelo per `/api/v1/*`. In dev usare un proxy
Vite (da configurare in Phase B quando arriva il primo fetch).

## Build

```bash
npm run build:mobile
# output: clients/mobile-web/dist/
```

In prod il `dist/` viene incorporato nel binario Go (vedi Phase F del piano).

## Stato

- ✅ Phase A — bootstrap (questo commit)
- ⏳ Phase B — pairing flow (deep link `/m/?pair=<token>`)
- ⏳ Phase C — API client + auth mobile mode
- ⏳ Phase D — 3 tab (Cerca / Scan / Account)
- ⏳ Phase E — PWA offline + cache strategies
- ⏳ Phase F — multi-stage Docker + embed Go
