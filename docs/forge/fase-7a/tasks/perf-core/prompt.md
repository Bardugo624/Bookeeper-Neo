Leggi prima `docs/forge/fase-7a/CONTRATTO.md` (libreria di prova e budget). Leggi `crates/bookeeper-core/src/db/migrations`, `crates/bookeeper-core/src/api/books.rs`, `books_search.rs`, `facets.rs`, `stats.rs`, `isbn_index.rs`, `loans.rs`, `audit.rs`, `shelves.rs` e `crates/bookeeper-core/tests/common`.

# Core: 10.000 libri

## Cosa fare

1. **Libreria di prova**: aiutante nuovo in `crates/bookeeper-core/tests/common/`, come da contratto. Scrive direttamente nel database in una transazione (non attraverso l'API), per restare veloce.
2. **Misura**: test nuovo `crates/bookeeper-core/tests/perf_10k.rs`, con `#[ignore]`, che per ogni rotta del contratto stampa mediana e 95° percentile e fallisce se la mediana supera il budget. Si esegue con `cargo test --release -p bookeeper-core --test perf_10k -- --ignored --nocapture`.
3. **Piani di query**: test nuovo, non ignorato, in `perf_10k.rs`, che con `EXPLAIN QUERY PLAN` verifica che le query delle rotte del contratto usino un indice dove la libreria filtra o ordina (nessuna `SCAN` della tabella dei libri senza indice per i filtri per libreria, ISBN, mobile, stato di lettura).
4. **Correzioni**: dove una rotta supera il budget, correggi la query o aggiungi indici con la migrazione nuova `0004_perf.sql`. Nessuna modifica di comportamento: i test esistenti restano verdi.
5. Riporta nel rapporto la tabella delle misure prima e dopo.

## Acceptance criteria

- `cargo fmt --check` e `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passano.
- `cargo test -p bookeeper-core` passa.
- `cargo test --release -p bookeeper-core --test perf_10k -- --ignored --nocapture` passa: ogni mediana entro il budget.
- Cambiano solo file sotto `crates/bookeeper-core/src/`, `crates/bookeeper-core/tests/` e `packages/api/openapi.json` (solo se cambia la specifica, con `UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi`).
