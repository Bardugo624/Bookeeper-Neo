Leggi prima `docs/forge/fase-10b4/CONTRATTO.md` e la seconda revisione in `docs/forge/fase-10b4/REVISIONE.md`.

# Libreria: l'anello sulla copertina senza disco bianco

## File
`apps/desktop/src/modules/books/BookCard.module.css` e `BookCardProgress.test.tsx`.

## Cosa fare
Cattura `desktop-01-libreria`: allo 0% l'anello sulla copertina è un disco bianco con un anello grigio, come un pulsante radio vuoto. La regola `.ring` ha lo sfondo `--bk-surface` e un'ombra di riquadro. Fai come dice il contratto. Sulle righe dell'elenco del telefono e nella scheda del libro l'anello è già giusto: non cambiano.

## Test
- `the_cover_ring_has_no_disc_under_it`.

## Acceptance criteria
- Da `apps/desktop`: `npx vitest run src/modules/books` e `npm run typecheck -w @bookeeper/desktop` passano.
- Guardato in Chromium nella build di produzione: l'anello si legge su una copertina scura e su una chiara.
