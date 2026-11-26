Leggi prima `docs/forge/fase-6a/CONTRATTO.md` (sezioni Regole e Indice ISBN). Le task `people-api` e `family-api` sono già unite. Leggi `crates/bookeeper-core/src/api/books.rs`, `shelves.rs`, `lookup.rs` (conversione ISBN-10 → ISBN-13) e `tests/books_api.rs`.

# Core: indice ISBN per l'anti-doppio-acquisto

## Cosa fare

1. File nuovo `crates/bookeeper-core/src/api/isbn_index.rs` con `GET /books/isbn-index?version=`, come da contratto. Una sola query con le unioni necessarie (libri, collocazioni, mobili).
2. La conversione ISBN-10 → ISBN-13 è quella che il core già usa: se oggi è privata in `lookup.rs`, rendila riusabile senza duplicarla.
3. `version`: impronta SHA-256 con `ring::digest` delle voci serializzate, in esadecimale. Nessuna dipendenza nuova.
4. La rotta va registrata prima di `/books/{id}` se l'ordine delle rotte lo richiede: verifica che `GET /books/isbn-index` non finisca nel dettaglio di un libro.

## Test (`crates/bookeeper-core/tests/isbn_index_api.rs`)

- Libro con ISBN-13, con solo ISBN-10 (voce con l'ISBN-13 ricavato), senza ISBN (assente), due copie dello stesso ISBN (due voci); ordine.
- Collocazione: libro collocato con mobile, ripiano e posto; libro non collocato con `null`.
- `version` stabile a dati uguali; `unchanged: true` con la versione attuale; cambia dopo: modifica di un titolo, nuova collocazione, rinomina del mobile, nuovo libro, eliminazione.
- Ogni ruolo può leggere; isolamento tra librerie (i libri dell'altra non compaiono).
- 2.000 libri: la risposta arriva e contiene 2.000 voci (nessuna soglia di tempo nel test).

## Acceptance criteria

- `cargo fmt --check` passa.
- `cargo test -p bookeeper-core` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- Cambiano solo file sotto `crates/bookeeper-core/src/api/`, `crates/bookeeper-core/src/openapi.rs`, `crates/bookeeper-core/tests/`, e `packages/api/openapi.json` (aggiornata solo con il comando del contratto).
