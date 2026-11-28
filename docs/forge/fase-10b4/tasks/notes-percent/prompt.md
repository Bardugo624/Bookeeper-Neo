Leggi prima `docs/forge/fase-10b4/CONTRATTO.md` e la seconda revisione in `docs/forge/fase-10b4/REVISIONE.md`.

# Lettore: le percentuali delle note con un decimale

## File
In `packages/reader/src/ui/panel/`: `NotesList.tsx`, `NoteItem.tsx`, `panel.test.tsx`.

## Cosa fare
Catture `desktop-07-note` e `mobile-07-note`: «Capitolo 1 · 0%». La riga «Capitolo · N%» usa `formatPercent` di `ui/view/format.ts`, con la lingua del lettore, come l'indice e la ricerca.

## Test
- `note_percents_have_one_decimal_under_ten`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
