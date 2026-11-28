Leggi prima `docs/forge/fase-10b4/CONTRATTO.md` e la seconda revisione in `docs/forge/fase-10b4/REVISIONE.md`.

# Lettore: l'articolo giusto davanti alla percentuale

## File
In `packages/reader/src/ui/view/`: `format.ts` con un suo test, `BottomBar.tsx`, `bottom.test.tsx`. `packages/reader/src/app/useQuestion.ts`. I testi in `packages/i18n/src/locales/it/reader.json` e `en/reader.json`.

## Cosa fare
Cattura `desktop-12-torna`: «Torna al 0%». «Torna …» e «Vai …» seguono il contratto. Le chiavi italiane hanno una forma per «al», una per «all'» e una per «allo»; `format.ts` sceglie quale dal numero già scritto.

## Test
- `the_article_follows_the_number` (0, 0,4, 1, 1,5, 8, 11, 18, 45, 80, 83, 89, 90, 100).
- `jump_back_and_go_use_the_article`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
