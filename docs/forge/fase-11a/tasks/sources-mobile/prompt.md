Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Telefono: il riquadro «Fonti» nel risultato della scansione

## File
In `apps/mobile/src/modules/scan/`: `ResultSheet.tsx`, `useIsbnLookup.ts`, `useAddBook.ts`, `shelfFlow.ts` e `result.test.tsx`; i testi in `packages/i18n/src/locales/it/mscan.json` e `en/mscan.json`.

## Cosa fare
- La ricerca usa `lookupIsbnReport`. Il flusso di oggi non cambia.
- Il riquadro `SourceList` del kit sta nel foglio del risultato, come dice il contratto.
- «Riprova» richiede con `fresh: true`.

## Test
- `the_result_sheet_shows_the_sources`.
- `not_found_shows_which_source_failed`.

## Acceptance criteria
- Da `apps/mobile`: `npx vitest run src/modules/scan` e `npm run typecheck -w @bookeeper/mobile` passano.
- Guardato in Chromium nella build di produzione a 390×844, tema chiaro e scuro.
