Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Telefono: il lettore a tutto schermo

## File
- `apps/mobile/src/modules/reader/`, nuovo modulo.
- `apps/mobile/src/app/` (rotte, tipi e aiuti dei test) e, se serve, `apps/mobile/src/platform/`.
- `apps/mobile/reader-frame.html`, `apps/mobile/src/readerFrame.ts` e `apps/mobile/vite.config.ts`.
- `packages/i18n/src/locales/it/mreader.json` e `en/mreader.json`.

## Cosa fare
- **`screens` in `MobileModule`:** le rotte si montano dentro `AppFrame` e `SessionGate`, fuori da `Shell`, quindi senza barra delle schede.
- **Il modulo `reader`:** la rotta `/read/:bookId`. `ReaderScreen`:
  - sceglie il file come dice il contratto;
  - chi non può leggere i file torna alla scheda;
  - monta `ReaderApp` con `platform="phone"`;
  - mentre legge mette `theme-color` al colore della pagina, e lo rimette com'era all'uscita;
  - rispetta le aree sicure.
- **Il backend del telefono** (`mobileBackend.ts`):
  - posizioni e note con il client;
  - `loadFile` scarica il contenuto con il transport della sessione, con l'avanzamento. La copia offline la aggiunge `mobile-offline`, con un punto d'aggancio già pronto;
  - `openExternal` con `window.open(url, '_blank', 'noopener')`;
  - `saveText` con `navigator.share` dei file quando si può, altrimenti un download;
  - la coda è `idbQueue('bookeeper-reader')`.
- **`vite.config.ts`:**
  - la seconda entrata `reader-frame.html` e `foliateAssets()`;
  - il service worker come nel contratto;
  - togli `globIgnores: ['prova-lettore/**']`.

## Passi
- [ ] Test, prima del codice:
  - `the_reader_route_has_no_tab_bar`;
  - `picks_the_epub_first`;
  - `who_cannot_read_goes_back_to_the_book`;
  - `theme_color_follows_the_page_and_comes_back`;
  - `export_shares_or_downloads`;
  - `the_service_worker_precaches_the_reader`: legge la configurazione di workbox.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.
- [ ] Prova a mano con `npm run build -w apps/mobile` e `vite preview`, in Chromium a 390×844: apri un EPUB, gira pagina con il tocco, apri il foglio delle note. Allega le schermate al rapporto, non al commit.

## Acceptance criteria
- `npm test -w apps/mobile`, `npm test -w @bookeeper/i18n`, `npm run typecheck -w apps/mobile` e `npm run build -w apps/mobile` passano.
- `dist/` contiene `reader-frame.html` e `reader/foliate-js/`.
- `impeccable detect --json` è pulito sui file nuovi.
