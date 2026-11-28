Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Kit: il riquadro «Fonti»

## File
In `packages/ui/src/book/`: `SourceList.tsx` con CSS e test nuovi, `index.ts` e `index.test.ts`.

## Cosa fare
`SourceList({ title, sources, retryLabel?, onRetry? })`, dove `sources` è `{ id, name, status, statusLabel }[]` e `status` è uno degli stati del contratto. Le parole arrivano dall'app, perché il kit non traduce. Aspetto, pallini, misure e accessibilità come il riquadro del contratto. «Riprova» si vede solo con `onRetry` e una fonte in `error`, `timeout` o `rate_limited`.

## Test
- `each_status_has_its_dot_and_its_words`.
- `retry_shows_only_after_a_failure`.
- `rows_have_accessible_names`.

## Acceptance criteria
- `npm test -w @bookeeper/ui` e `npm run typecheck -w @bookeeper/ui` passano.
