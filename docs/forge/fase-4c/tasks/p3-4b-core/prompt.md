Leggi prima `docs/forge/fase-4a/CONTRATTO.md`.

# Core: commento superato sulle faccette

`crates/bookeeper-core/src/api/facets.rs`, commento di documentazione di `Facets.genres`: dice ancora "Grouped ignoring ASCII case". Il raggruppamento ora ignora le maiuscole Unicode. Correggi il commento e rigenera `packages/api/openapi.json` e `packages/api/src/schema.d.ts` con i comandi che il repository già usa (leggi `packages/api/package.json` e il test che confronta la specifica generata). Nessun'altra differenza nella specifica.

## Acceptance criteria

- `cargo fmt --check` passa.
- `cargo test -p bookeeper-core` passa, compreso il test che confronta `openapi.json` con la specifica generata.
- `npm test -w @bookeeper/api` e `npm run typecheck -w @bookeeper/api` passano.
- Cambiano solo: `crates/bookeeper-core/src/api/facets.rs`, `packages/api/openapi.json`, `packages/api/src/schema.d.ts`.
