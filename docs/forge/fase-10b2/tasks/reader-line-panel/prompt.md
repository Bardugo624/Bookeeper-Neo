Leggi prima `docs/forge/fase-10b2/CONTRATTO.md` e la revisione finale in `docs/forge/fase-10b2/REVISIONE.md`.

# Lettore: linea sottile, margini del foglio, citazioni e percentuali

## File
`packages/reader/src/ui/view/Reader.module.css`, `layout.test.tsx` e `format.ts`; `packages/reader/src/ui/panel/`; `packages/reader/src/app/useSelection.ts` con un suo test.

## Cosa fare
- **Linea sottile** (catture `desktop-04` e `mobile-05`): traccia e riempimento come nel contratto, anche nella disposizione del telefono.
- **Margini doppi nel foglio** (cattura `mobile-07`): sotto `[data-variant='sheet']` il pannello toglie i suoi 16 px laterali (`CompanionPanel.module.css`, `NotesList.module.css`). Così il contenuto è allineato al titolo e i filtri stanno su una riga.
- **Citazioni:** `useSelection` toglie gli spazi all'inizio e alla fine del testo scelto, così la citazione legge «capitolo … ombr», non «« capitolo …».
- **Percentuali:** sotto il 10% una cifra decimale, nei risultati della ricerca e nell'indice.

## Test
- `the_thin_line_has_a_track_even_at_zero`.
- `sheet_variant_has_no_side_padding_of_its_own`.
- `a_selection_quote_is_trimmed`.
- `small_percents_have_one_decimal`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
