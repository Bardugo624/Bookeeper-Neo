Leggi prima `docs/forge/fase-10b4/CONTRATTO.md` e la seconda revisione in `docs/forge/fase-10b4/REVISIONE.md`.

# Lettore: i segni della ricerca solo mentre si cerca

## File
In `packages/reader/src/app/`: `useSearch.ts` con un suo test, `ReaderScreen.tsx`. `packages/reader/src/ui/panel/SearchTab.tsx`. In `packages/reader/src/frame/`: `boot.ts`, `search.ts`, `boot.test.ts`.

## Cosa fare
Catture `desktop-09-aspetto` e `desktop-10-tema-*`: col pannello chiuso «lento» resta sottolineato sulla pagina. Fai come dice il contratto. Il contorno del risultato scelto e la sottolineatura degli altri non cambiano mentre la ricerca è aperta.

## Test
- `closing_search_clears_the_marks`.
- `clearing_the_query_clears_the_marks`.
- `on_the_phone_a_chosen_result_keeps_its_marks_until_the_next_page`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- `node packages/reader/e2e/run.mjs --browsers chromium --out /tmp/reader-e2e.json` passa.
