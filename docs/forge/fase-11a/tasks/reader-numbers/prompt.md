Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Lettore: mai 100% prima della fine, e lo stesso numero in «Vai …»

## File
`packages/reader/src/ui/view/format.ts` e il suo test; `packages/reader/src/app/useQuestion.ts` con un suo test.

## Cosa fare
- La percentuale segue il contratto: mai 100% prima dell'ultima pagina.
- Nella domanda «Continua da …», il pulsante «Vai …», la riga di dettaglio e il testo della pagina mostrano lo stesso numero, scritto come la percentuale.

## Test
- `the_percent_stays_below_100_until_the_end`.
- `go_and_the_detail_show_the_same_number`.
- `go_reads_its_article` (per esempio «Vai all'8%»).

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
