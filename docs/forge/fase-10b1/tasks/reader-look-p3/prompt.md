Leggi prima `docs/forge/fase-10b1/CONTRATTO.md`.

# Lettore: Aspetto ancorato al pulsante Aa

## File
- `packages/ui/src/overlays/`: il nuovo `Popover`, con il suo test e l'export.
- `packages/reader/src/ui/look/`, `packages/reader/src/ui/view/TopBar.tsx` e `packages/reader/src/app/`.
- `packages/i18n/src/locales/it/rlook.json` e `en/rlook.json`, se servono testi.

## Cosa fare
- **`Popover`** del kit, come dice il contratto.
- **Aspetto sul computer:** il `Popover` ancorato sotto il pulsante Aa della barra in alto, non modale e senza velo. I cambi si vedono subito sulla pagina. Esc, un clic fuori o lo stesso pulsante lo chiudono, e il fuoco torna al pulsante.
- **I temi:** cinque riquadri con «Aa» nei colori del tema e il nome sotto, «Auto» diviso in diagonale. I colori vengono da `THEME_COLORS`.
- **Sul telefono:** resta il foglio dal basso, senza la riga «Due pagine quando c'è spazio».

## Test
- `popover_opens_from_its_trigger_closes_on_escape_and_returns_focus`.
- `appearance_on_desktop_is_anchored_and_not_modal`: la pagina non ha `aria-hidden` mentre è aperto.
- `theme_tiles_show_each_theme`.
- `two_pages_row_is_not_on_the_phone`.

## Acceptance criteria
- `npm test -w @bookeeper/ui`, `npm test -w @bookeeper/reader`, `npm test -w @bookeeper/i18n` e `npm run typecheck -w @bookeeper/reader` passano.
- Guardato in Chromium nella build di produzione del computer, come lo schizzo `04`.
