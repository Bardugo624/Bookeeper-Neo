Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Computer: il riquadro «Fonti» nel passo ISBN

## File
In `apps/desktop/src/modules/books/`: `IsbnStep.tsx`, `LookupNotice.tsx`, `useIsbnLookup.ts`, `useBookEditor.ts` e un nuovo `isbnSources.test.tsx`; i testi in `packages/i18n/src/locales/it/books.json` e `en/books.json`.

## Cosa fare
- La ricerca usa `lookupIsbnReport`. «Trovato» e «non trovato» funzionano come oggi.
- Il riquadro `SourceList` del kit sta dove dice il contratto, con le parole e i nomi del contratto.
- «Riprova» richiede con `fresh: true`.

## Test
- `the_sources_box_shows_under_a_found_book`.
- `the_sources_box_explains_not_found`.
- `retry_asks_fresh`.

## Acceptance criteria
- Da `apps/desktop`: `npx vitest run src/modules/books` e `npm run typecheck -w @bookeeper/desktop` passano.
- Guardato in Chromium nella build di produzione, tema chiaro e scuro.
