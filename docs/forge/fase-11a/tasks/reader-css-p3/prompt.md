Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Lettore: movimenti, token e il test della barra

## File
In `packages/reader/src/ui/view/`: `Bars.module.css`, `ProgressSlider.module.css`, `ReaderStatus.module.css`, `Reader.module.css` e `bottom.test.tsx`; `ui/look/Look.module.css`; un nuovo `packages/reader/src/cssRules.test.ts`.

## Cosa fare
- Il contratto vale su movimenti e token:
  - la barra di avanzamento cresce con `transform: scaleX`, non con `width`;
  - nessuna transizione di colore o di sfondo;
  - tutto dentro `prefers-reduced-motion: no-preference`;
  - niente `--bk-radius-md`, `--bk-font-sans` e `--bk-surface-inset`, che non esistono.
- Il commento di `Bars.module.css` dice «Inline, not flex» per `display: block`: correggilo.
- Il test della barra in `bottom.test.tsx` oggi non può fallire, perché jsdom non carica il CSS. Deve leggere la regola `.times` dal file.

## Test
- In `cssRules.test.ts`:
  - `animations_only_move_transform_and_opacity_and_respect_reduced_motion`;
  - `every_bk_token_is_defined`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
