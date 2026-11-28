Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Computer e kit: l'anello sulle copertine scure e i token

## File
`apps/desktop/src/modules/reading/ReadingNow.tsx`; `packages/ui/src/book/ProgressRing.module.css` con il suo test; in `apps/desktop/src/modules/books/`: `BookCard.module.css` e `BookCardProgress.test.tsx`; `apps/desktop/src/modules/settings/sections/sharing/SharingSection.module.css`, `apps/desktop/src/modules/devices/QrCode.module.css`, `apps/desktop/src/kit/dialogs.module.css`.

## Cosa fare
- Il commento su `NOW_MAX` parla ancora di «Tutti»: aggiornalo a «Vedi tutti (N)» e al caso in cui il collegamento non c'è.
- In tema scuro, sulle copertine scure, l'anello allo 0% quasi non si vede (`#2c2a25` su `#4a4a4a`). La traccia dell'anello si può dare da fuori, con `--ring-track`. Sulla copertina vale `rgb(255 255 255 / 0.6)` in tutti e due i temi, con l'ombra di oggi; altrove resta `--bk-border-strong`.
- Niente `--bk-radius-md`, `--bk-font-sans` e `--bk-surface-inset` nei tre CSS del computer elencati: usa i token che esistono.

## Test
- `the_cover_ring_track_reads_on_dark_covers`.

## Acceptance criteria
- `npm test -w @bookeeper/ui` passa.
- Da `apps/desktop`: `npx vitest run src/modules/books src/modules/reading` e `npm run typecheck -w @bookeeper/desktop` passano.
