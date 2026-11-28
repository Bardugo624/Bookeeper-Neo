Leggi prima `docs/forge/fase-10b4/CONTRATTO.md` e la seconda revisione in `docs/forge/fase-10b4/REVISIONE.md`.

# Lettore: gli stati d'errore senza gli strumenti di lettura

## File
`packages/reader/src/app/ReaderScreen.tsx`; in `packages/reader/src/ui/view/`: `Reader.tsx`, `TopBar.tsx`, `BottomBar.tsx`, `ReaderStatus.tsx`, `chrome.test.tsx`, `status.test.tsx`.

## Cosa fare
Catture `desktop-15-file-mancante` e `desktop-16-file-rotto`: senza un libro aperto restano Cerca, Segnalibro, Aspetto, Pannello e una traccia allo 0%. Fai come dice il contratto, sul computer e sul telefono.

## Test
- `an_error_state_keeps_only_back_and_title`.
- `an_error_state_has_no_bottom_bar_and_no_line`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
