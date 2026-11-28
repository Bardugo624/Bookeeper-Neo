Leggi prima `docs/forge/fase-10b1/CONTRATTO.md`.

# Computer: titolo della finestra e card «In lettura»

## File
`apps/desktop/src/platform/`, `apps/desktop/src/modules/reader/`, `apps/desktop/src/modules/reading/` e `apps/desktop/src-tauri/capabilities/default.json`.

## Cosa fare
- **Titolo della finestra:** `document.title` non cambia il titolo nativo in Tauri 2. La piattaforma riceve `setWindowTitle(title)`, che in Tauri usa `getCurrentWindow().setTitle`, con il permesso `core:window:allow-set-title`; nel browser cambia `document.title`. Il lettore la usa e rimette «Bookeeper» all'uscita.
- **«In lettura»:** la riga ha 4 colonne uguali anche con uno, due o tre libri (schizzo `09`). Oggi una card sola prende tutta la riga.
- **Test di `browser.test.ts`:** lo stub di `URL.createObjectURL` torna com'era dopo il test.
- **Il commento di `platform/testing.ts`** dice il valore vero: `asset://localhost/reader/...`.

## Test
- `the_reader_sets_the_native_window_title_and_restores_it`.
- `reading_now_keeps_four_columns_with_one_book`: la card ha la larghezza di un quarto della riga.

## Acceptance criteria
- `npx vitest run src/platform src/modules/reader src/modules/reading src/kit/styles.test.ts` (da `apps/desktop`) e `npm run typecheck -w @bookeeper/desktop` passano.
- Guardata in Chromium nella build di produzione, la riga «In lettura» con un libro solo ha una card stretta, come le altre.
