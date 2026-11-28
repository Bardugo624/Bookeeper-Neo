Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Lettore: la ricerca resta quando esci dalla scheda

## File
In `packages/reader/src/`: `app/useSearch.ts` con il suo test, `ui/panel/SearchTab.tsx` e `panel.test.tsx`, `frame/boot.ts`, `frame/search.ts` e `boot.test.ts`, `engine/protocol.ts` ed `Engine.ts`.

## Cosa fare
Correzione 4 della terza revisione (`docs/forge/fase-10b4b/REVISIONE.md`).
- Finché il libro è aperto restano la parola cercata, i risultati e il punto dell'elenco.
- Chiudere il pannello o cambiare scheda toglie solo i segni dalla pagina; tornare su Cerca li rimette senza cercare di nuovo.
- Solo svuotare il campo butta via la ricerca.
- Sul telefono valgono le regole della 10B4 sul risultato scelto.

## Test
- `leaving_search_keeps_the_query_and_results`.
- `coming_back_redraws_the_marks_without_searching_again`.
- `clearing_the_field_drops_the_search`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- `node packages/reader/e2e/run.mjs --browsers chromium --out /tmp/reader-e2e.json` passa.
