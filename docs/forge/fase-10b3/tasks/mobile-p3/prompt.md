Leggi prima `docs/forge/fase-10b3/CONTRATTO.md`.

# Telefono: la misura del file una volta sola

## File
`apps/mobile/src/modules/search/ReadButton.tsx`, con il suo CSS e il suo test.

## Cosa fare
Oggi, salvato il libro, la misura compare due volte di fila: «Sul telefono · 2,4 MB» dal controllo, poi «EPUB · 2,4 MB» sotto. Fai come dice il contratto.

## Test
- `a_saved_book_shows_its_size_once`.

## Acceptance criteria
- `npx vitest run src/modules/search` (da `apps/mobile`) e `npm run typecheck -w @bookeeper/mobile` passano.
