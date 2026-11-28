Leggi prima `docs/forge/fase-10b4/CONTRATTO.md` e la seconda revisione in `docs/forge/fase-10b4/REVISIONE.md`.

# Lettore: articoli, ore e percentuali delle note

## File
In `packages/reader/src/ui/view/`: `format.ts` con un suo test, `BottomBar.tsx`, `bottom.test.tsx`. In `packages/reader/src/ui/panel/`: `NotesList.tsx`, `NoteItem.tsx`, `panel.test.tsx`. In `packages/reader/src/app/`: `helpers.ts` con un suo test, `useQuestion.ts`. I testi in `packages/i18n/src/locales/it/reader.json` e `en/reader.json`.

## Cosa fare
- **Articolo** (cattura `desktop-12-torna`: «Torna al 0%»): «Torna …» e «Vai …» seguono il contratto. Le chiavi italiane hanno una forma per «al», una per «all'» e una per «allo»; `format.ts` sceglie quale.
- **Quando** (cattura `desktop-11-continua`: «questo minuto»; schizzo `05`: «ieri alle 22:40»): `sinceText` in `helpers.ts` segue il contratto.
- **Percentuali delle note** (catture `desktop-07-note` e `mobile-07-note`: «Capitolo 1 · 0%»): usa `formatPercent`, come l'indice e la ricerca.

## Test
- `the_article_follows_the_number` (0, 0,4, 1, 1,5, 8, 11, 18, 45, 80, 83, 89, 90, 100).
- `when_reads_now_today_yesterday_and_dates`.
- `note_percents_have_one_decimal_under_ten`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
