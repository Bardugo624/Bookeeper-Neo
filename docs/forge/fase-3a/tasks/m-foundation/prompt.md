Leggi prima `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/`, `apps/desktop/src/{app,session,shell}` (stessa impostazione, da adattare: non importare da `apps/desktop`), `packages/api/src/`, `packages/ui/src/`, `crates/bookeeper-server/src/web.rs` e `build.rs`, e `clients/mobile-web/src/{views/TabsShell.vue,composables/usePwaUpdate.ts,sw.ts}`.

# Mobile: fondamenta, sessione, guscio a schede, PWA

## Cosa fare

1. **Dipendenze** in `apps/mobile/package.json`: `react-router` 7, `@tanstack/react-query` 5, `zustand` 5, `vite-plugin-pwa`, `@zxing/browser` e `@zxing/library` (ripiego per i codici a barre, usato dalla task `m-scan`), `@testing-library/user-event`. `npm install` dalla radice.
2. **`platform/`**: interfacce e implementazioni browser per: archivio (`localStorage` con ripiego in memoria), service worker (registrazione, "versione nuova pronta", "attiva e ricarica"), stato di rete (`online`/`offline`), fotocamera (`getUserMedia` con fotocamera posteriore; elenco dei dispositivi; torcia se disponibile), lettore di codici a barre (`BarcodeDetector` se esiste, altrimenti ZXing; formati EAN-13, EAN-8, UPC-A, QR). Più le versioni finte per i test in `platform/testing.ts`.
3. **`session/`**, **`app/`**, **`shell/`**, **`kit/`** secondo il contratto: cancello del contesto sicuro, sessione, trasporto autenticato con un solo rinnovo condiviso, `ClientProvider`, fornitore della lingua (`useT`), tema che segue il sistema, router a moduli, guscio con barra delle schede in basso (icona e etichetta, attiva con `aria-current`, rispetto dell'area sicura), intestazione di vista, banner di aggiornamento, striscia offline. Senza moduli: uno stato vuoto. `kit/`: `Screen` (intestazione, area scorrevole, piede), `ListRow`, `ErrorState` con "Riprova", `BottomSheet` (su `Dialog` di `@bookeeper/ui/overlays`, ancorato in basso), `apiErrorMessage` per i codici del core.
4. **PWA** e **build** secondo il contratto. Importa `@bookeeper/ui/fonts.css`, `tokens.css`, `base.css`. `index.html`: `viewport-fit=cover`, colore del tema, icona per iOS.
5. **`App.tsx`** e il suo test di oggi spariscono o cambiano: la pagina di stato non serve più.
6. Testi nello spazio dei nomi `mobile` (aggiungi a quello esistente; la chiave `mobile.needsHttps` resta).

## Test

Con le piattaforme finte e un trasporto finto, `renderMobile({ platform, modules, route })` in `app/testing.tsx` per le task dei moduli.

- Contesto non sicuro → solo la pagina dedicata e nessuna richiesta.
- Sessione: senza token → `unpaired` e rotta `/pair`; token valido → `ready`; `token_expired` → rinnovo e token nuovi salvati; `device_revoked` → `unpaired` e token cancellati; due 401 insieme → un solo rinnovo; un 401 `invalid_credentials` non rinnova.
- Guscio: schede dai moduli in ordine; attiva con `aria-current`; ogni scheda è alta almeno 44px (controllo sul CSS).
- Aggiornamento: "versione nuova pronta" → banner; "Aggiorna" chiama "attiva e ricarica"; senza tocco nulla si ricarica.
- Offline: la striscia compare e scompare con lo stato di rete.
- Lettore di codici: usa `BarcodeDetector` se presente, altrimenti il ripiego.
- Test di stile sui `.module.css` di `apps/mobile/src` (nessun colore scritto, animazioni solo con movimento permesso), con lo stesso aiuto usato in `packages/ui` se esportato, altrimenti locale.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile`, `npm run build -w @bookeeper/mobile` passano.
- `apps/mobile/dist` contiene `index.html`, un manifest e un service worker; il service worker non contiene regole di cache per `/api/`.
- `cargo build -p bookeeper-server` e `cargo test -p bookeeper-server` passano con il `dist` nuovo (il test esistente della pagina iniziale resta verde).
- `npm run typecheck` e `npm test` dalla radice passano.
- Nessun componente supera 250 righe.
- Cambiano solo: file sotto `apps/mobile/`, `package-lock.json`, `packages/i18n/src/locales/{it,en}/mobile.json`, `crates/bookeeper-server/build.rs`.
