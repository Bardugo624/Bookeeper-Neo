Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Ricerca ISBN: lo stato di ogni fonte e la chiave di Google

## File
`crates/bookeeper-core/src/lookup/`, `src/api/lookup.rs`, `src/state.rs` e i test `lookup_api.rs`, `lookup_google.rs`, `lookup_annas.rs`; in `crates/bookeeper-server/src/`: `config.rs` e dove si costruisce lo stato (`lib.rs` o `main.rs`); `packages/api/openapi.json`, `src/schema.d.ts` (con `npm run gen -w @bookeeper/api`), `src/resources/lookup.ts` e il suo test.

## Cosa fare
- Ogni fonte dà uno stato del contratto, timeout compreso; il 429 di Google è `rate_limited`.
- Il servizio tiene gli stati in memoria con il risultato e applica la regola del «non trovato».
- La chiave di Google arriva dal server: argomento `--google-books-key`, variabile `BOOKEEPER_GOOGLE_BOOKS_KEY`, senza valore predefinito. Non compare mai nei log né nelle risposte. Senza chiave Google non si chiama ed è `not_configured`.
- Anna's Archive solo su `annas-archive.gl`.
- L'endpoint `…/report` del contratto, documentato in OpenAPI. Il client TS riceve `lookupIsbnReport(isbn, { fresh })`.

## Test
- `report_lists_the_four_visible_sources_in_order`.
- `a_failed_source_does_not_cache_not_found`.
- `google_without_a_key_is_not_called`.
- `google_429_is_rate_limited`.
- `the_old_endpoint_is_unchanged`.

## Acceptance criteria
- `cargo test -p bookeeper-core --test lookup_api --test lookup_google --test lookup_annas` e `cargo test -p bookeeper-server` passano.
- `npm test -w @bookeeper/api` e `npm run typecheck -w @bookeeper/api` passano.
