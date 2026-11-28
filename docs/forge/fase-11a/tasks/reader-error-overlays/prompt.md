Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Lettore: niente fogli aperti sopra un errore

## File
`packages/reader/src/app/ReaderScreen.tsx` e `ReaderApp.test.tsx`.

## Cosa fare
Sul telefono il foglio del pannello e il foglio Aspetto vengono resi senza controllare `failed`. Se uno è aperto mentre il libro carica e poi il libro non si apre, resta sopra la schermata d'errore. Quando c'è un errore, nessun foglio, finestrella o editor resta aperto.

## Test
- `an_error_closes_the_open_sheets`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
