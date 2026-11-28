Leggi prima `docs/forge/fase-10b4/CONTRATTO.md` e la seconda revisione in `docs/forge/fase-10b4/REVISIONE.md`.

# «In lettura»: niente «Tutti i 1»

## File
`ReadingNow.tsx` con il suo test, in `apps/desktop/src/modules/reading/` e in `apps/mobile/src/modules/reading/`; i testi in `packages/i18n/src/locales/{it,en}/reading.json` e `mreading.json`.

## Cosa fare
Catture `desktop-01-libreria` e `mobile-01-cerca`: il collegamento dice «Tutti i 1». Fai come dice il contratto.

## Test
- `the_all_link_hides_when_every_book_is_shown`.
- `the_all_link_counts_without_an_article`.

## Acceptance criteria
- Da `apps/desktop` e da `apps/mobile`: `npx vitest run src/modules/reading` passa.
- `npm run typecheck -w @bookeeper/desktop` e `npm run typecheck -w @bookeeper/mobile` passano.
