Leggi prima `docs/forge/fase-10b2/CONTRATTO.md` e la revisione finale in `docs/forge/fase-10b2/REVISIONE.md`.

# Lettore: il foglio Aspetto del telefono mostra tutte le righe

## File
`packages/reader/src/ui/view/Sheet.tsx` e `Sheet.css`; `packages/reader/src/ui/look/`; i testi in `packages/i18n/src/locales/it/rlook.json` e `en/rlook.json`.

## Cosa fare
Cattura `mobile-08` contro lo schizzo `08`.
- Il foglio Aspetto si apre alto quanto il contenuto, al massimo il 92% dello schermo. Gli altri fogli restano al 70%.
- Interlinea e Margini stanno sulla stessa riga; i margini come S, M e L, ciascuno con il nome intero accessibile.
- Così a 390×844 si vede tutto fino a «Stili dell'editore», senza scorrere.
- Sul computer la finestrella Aspetto non cambia.

## Test
- `phone_appearance_sheet_fits_its_rows`.
- `other_sheets_still_open_at_70_percent`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- Guardato in Chromium nella build di produzione del telefono a 390×844.
