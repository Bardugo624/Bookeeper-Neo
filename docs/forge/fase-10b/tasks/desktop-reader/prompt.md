Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Computer: il lettore a tutta finestra

## File
- `apps/desktop/src/modules/reader/`, nuovo modulo.
- `apps/desktop/src/app/` (rotte, tipi e aiuti dei test).
- `apps/desktop/src/shell/` (`TitleBar.tsx` e il nuovo `WindowControls.tsx`).
- `apps/desktop/reader-frame.html`, `apps/desktop/src/readerFrame.ts` e `apps/desktop/vite.config.ts`.
- `packages/i18n/src/locales/it/dreader.json` e `en/dreader.json`.

La parte nativa (`reader_file`, opener, protocollo `asset`, metodi della piattaforma) è già unita con `desktop-native`.

## Cosa fare
- **`screens` in `AppModule`:** le rotte si montano come figlie di `SessionGate`, accanto a `Shell`.
- **Il modulo `reader`:** la rotta `/read/:bookId`. `ReaderView`:
  - sceglie il file come dice il contratto;
  - un `guest` torna alla scheda del libro;
  - monta `ReaderApp` con `platform="desktop"`;
  - mette nel titolo della finestra il titolo del libro;
  - passa i pulsanti della finestra come `topEnd`.
- **`WindowControls`:** i tre pulsanti di `TitleBar`, estratti in un componente che `TitleBar` riusa.
- **Il backend del computer** (`desktopBackend.ts`):
  - posizioni e note con il client di `@bookeeper/api`;
  - `loadFile` con `platform.readerFile(...)` e `fetch` dell'URL che restituisce;
  - `openExternal` con `platform.openUrl`;
  - `saveText` con la finestra di salvataggio che l'app usa già;
  - la coda è `idbQueue('bookeeper-reader')`.
- **`reader-frame.html` e `foliateAssets()`** nella configurazione di Vite.

## Passi
- [ ] Test, prima del codice:
  - `the_reader_route_has_no_sidebar`, `picks_the_epub_first`, `guests_go_back_to_the_book`, `the_top_bar_has_the_window_controls`, `the_window_title_is_the_book`, `web_search_opens_duckduckgo`, `load_file_reads_the_platform_url`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.
- [ ] Prova a mano con `npm run dev -w apps/desktop` in Chromium e il server di sviluppo: apri un EPUB, gira pagina, chiudi. Allega le schermate al rapporto, non al commit.

## Acceptance criteria
- Passano `npm test -w apps/desktop`, `npm run typecheck -w apps/desktop` e `npm run build -w apps/desktop`.
- `impeccable detect --json` è pulito sui file nuovi.
