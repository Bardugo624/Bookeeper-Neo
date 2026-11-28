Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Ricerca ISBN: lo stato di ogni fonte e la chiave di Google

## File
`crates/bookeeper-core/src/lookup/`, `src/state.rs` e i test `lookup_google.rs` e `lookup_annas.rs`; in `crates/bookeeper-server/src/`: `config.rs` e dove si costruisce lo stato (`lib.rs` o `main.rs`).

## Cosa fare
- Ogni fonte dà uno stato del contratto, timeout compreso; il 429 di Google è `rate_limited`.
- Il servizio restituisce i metadati e gli stati delle quattro fonti visibili. `LookupService::lookup` resta come oggi per chi lo usa, e c'è un metodo nuovo che dà anche gli stati. Gli stati stanno in memoria con il risultato, e vale la regola del «non trovato».
- La chiave di Google arriva dal server: argomento `--google-books-key`, variabile `BOOKEEPER_GOOGLE_BOOKS_KEY`, senza valore predefinito. Non compare mai nei log né nelle risposte. Senza chiave Google non si chiama ed è `not_configured`.
- Anna's Archive solo su `annas-archive.gl`.

## Test
- `statuses_follow_each_source`.
- `a_failed_source_does_not_cache_not_found`.
- `google_without_a_key_is_not_called`.
- `google_429_is_rate_limited`.

## Acceptance criteria
- `cargo test -p bookeeper-core --test lookup_google --test lookup_annas` e `cargo test -p bookeeper-server` passano.
- `cargo clippy -p bookeeper-core -p bookeeper-server --all-targets -- -D warnings` è pulito.
