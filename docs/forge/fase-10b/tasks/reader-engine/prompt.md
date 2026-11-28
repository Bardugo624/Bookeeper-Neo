Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Lettore: il pacchetto, il motore e il recinto

## File
- Crea `packages/reader`, con gli ingressi del contratto.
- Aggiungi `"@bookeeper/reader": "*"` alle dipendenze di `apps/desktop/package.json` e `apps/mobile/package.json`, poi `npm install` (`package-lock.json`).

## Cosa fare
- **Il pacchetto:** `package.json`, `tsconfig.json`, `vitest.config.ts` e `src/test-setup.ts`, come `packages/ui`. Gli ingressi delle task successive partono come `export {};`.
  - Dipendenze già per tutto il run: `@bookeeper/api`, `@bookeeper/i18n` e `@bookeeper/ui`; React come in `packages/ui`; per i test anche `fake-indexeddb`. Le task successive non toccano `package.json` né `package-lock.json`.
- **La copia di foliate-js** in `vendor/foliate-js/`, come dice il contratto.
  - Parti dai file della prova in `apps/mobile/public/prova-lettore/foliate-js/`: copiali, non spostarli. La prova la toglie `reader-e2e`.
  - Gli altri file vengono dal commit fissato.
  - Scrivi `VENDOR.md` e le licenze.
- **`src/vite`:** `foliateAssets()`.
- **`src/i18n`:** `ReaderLocale` e `useReaderT()`.
- **`src/engine`:**
  - `protocol.ts`, con i tipi del contratto;
  - `messages.ts`, che avvolge e controlla i messaggi;
  - `Engine.ts`.
- **`src/frame`:**
  - `bootFrame()`. Apre foliate-js con `import('/reader/foliate-js/view.js')`, collega gli eventi e applica la disposizione: attributi del renderer e `setStyles`;
  - `bookCss(layout)`, il foglio di stile del libro, in `bookCss.ts`. Non tocca `::selection`.
  - Le evidenziazioni si disegnano con `Overlayer` e le velature del layout.
  - I caratteri di sezione vengono dalle dimensioni delle sezioni di foliate-js.
  - Chiusura ordinata, senza l'errore del `ResizeObserver`.
- **`src/translationKeys.test.ts`**, come quello del telefono, per i prefissi `reader.`, `rpanel.` e `rlook.`.

## Passi
- [ ] Test, prima del codice:
  - `messages_carry_bk_and_version`;
  - `foreign_origins_and_windows_are_ignored`;
  - `a_new_search_supersedes_the_old_one`: la vecchia promessa si risolve;
  - `on_returns_an_unsubscribe`;
  - `close_resolves_when_the_frame_answers_closed`;
  - `book_css_follows_the_layout`: colori, carattere, dimensione, interlinea, giustificazione, sillabazione; con gli stili dell'editore spenti forza le regole del lettore;
  - `foliate_assets_copies_the_vendor_tree`: la build di prova contiene `reader/foliate-js/view.js` e `vendor/pdfjs/pdf.worker.mjs`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.
- [ ] Prova a mano in Chromium (Playwright c'è già nel container): una pagina di prova con `reader-frame.html` apre `libri/grande.epub` della prova e gira 10 pagine. La pagina non va nel commit; il test vero è `reader-e2e`.

## Acceptance criteria
- Passano `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader`.
- `VENDOR.md` elenca commit, file e licenze.
- I file di foliate-js sono identici a quelli del commit: lo prova un test con gli SHA-256 dei file in `VENDOR.md`.
