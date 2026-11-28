Leggi prima `docs/forge/fase-10b4b/CONTRATTO.md` e la terza revisione in `docs/forge/fase-10b4b/REVISIONE.md`.

# Lettore: lo spazio prima di «·» nella barra in basso

## File
`packages/reader/src/ui/view/BottomBar.tsx`, `Bars.module.css` e `bottom.test.tsx`.

## Cosa fare
Catture `desktop-03-aperto` («0%· 12 min…· 36 h 44 min…») e `mobile-05-lettura` («0%· 6 min»). Il codice scrive `{' · '}`, ma ogni `<span>` è un elemento flex, e il browser toglie lo spazio all'inizio di un elemento flex. Fai come dice il contratto.

## Test
- `the_times_read_with_a_space_on_each_side_of_the_dot`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- Guardato in Chromium nella build di produzione, sul computer e sul telefono.
