Leggi prima `docs/forge/fase-10b4/CONTRATTO.md` e la seconda revisione in `docs/forge/fase-10b4/REVISIONE.md`.

# Lettore: «adesso», «alle 15:49», «ieri alle 22:40»

## File
In `packages/reader/src/app/`: `helpers.ts` con un suo test, `useQuestion.ts`. I testi in `packages/i18n/src/locales/it/reader.json` e `en/reader.json`.

## Cosa fare
Cattura `desktop-11-continua`: «questo minuto»; lo schizzo `05` dice «ieri alle 22:40». `sinceText` in `helpers.ts` segue il contratto («Quando»).

## Test
- `when_reads_now_today_yesterday_and_dates` (in italiano e in inglese).

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
