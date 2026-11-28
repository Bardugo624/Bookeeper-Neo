Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Ricerca ISBN: l'endpoint con lo stato delle fonti

## File
`crates/bookeeper-core/src/api/lookup.rs` e `tests/lookup_api.rs`; `packages/api/openapi.json`, `src/schema.d.ts` (con `npm run gen -w @bookeeper/api`), `src/resources/lookup.ts` e `resources.test.ts`.

## Cosa fare
- L'endpoint `…/report` del contratto, documentato in OpenAPI. L'endpoint di oggi non cambia.
- Il client TS riceve `lookupIsbnReport(isbn, { fresh })`.

## Test
- `report_lists_the_four_visible_sources_in_order`.
- `report_of_an_unknown_isbn_has_no_metadata_and_the_statuses`.
- `the_old_endpoint_is_unchanged`.

## Acceptance criteria
- `cargo test -p bookeeper-core --test lookup_api` passa.
- `npm test -w @bookeeper/api` e `npm run typecheck -w @bookeeper/api` passano.
- `openapi.json` è quello che produce il server (il test del repository che li confronta passa).
