Leggi prima `docs/forge/fase-10b3/CONTRATTO.md`.

# Lettore: il risultato scelto resta segnato quando torni al suo capitolo

## File
`packages/reader/src/frame/`.

## Cosa fare
Oggi il contorno del risultato scelto sparisce se esci dal suo capitolo e poi ci torni (`boot.ts`, il disegno dei segni della ricerca). Quando un capitolo si ridisegna, il risultato scelto ha di nuovo il contorno e gli altri la sottolineatura.

## Test
- `the_chosen_result_keeps_its_outline_after_coming_back`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- `node packages/reader/e2e/run.mjs --browsers chromium --out /tmp/reader-e2e.json` passa.
