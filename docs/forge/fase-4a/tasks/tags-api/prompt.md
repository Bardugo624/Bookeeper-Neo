Leggi prima `docs/forge/fase-4a/CONTRATTO.md` e i contratti della fase 1 che cita. Leggi `crates/bookeeper-core/src/db/migrations/0001_schema.sql`, `src/db/mod.rs`, `src/api/mod.rs`, `src/openapi.rs`, `src/auth/guard.rs` e un modulo di rotte esistente con i suoi test (`src/api/wishlist.rs`, `tests/wishlist_api.rs`) per forma, errori, audit e isolamento.

# Core: tag

Implementa la sezione "Tag" del contratto, per intero.

## Punti da non sbagliare

- La task `reading-api` è già unita: `BookOut` ha già `reading`; aggiungi `tags` allo stesso modo, con una sola query in più per pagina.
- I colori ammessi sono quelli del vincolo `CHECK` di `shelves.color` nello schema; `tags.color` non ha quel vincolo: convalida nel codice.
- Unicità del nome senza distinguere le maiuscole e ignorando spazi iniziali e finali; il nome si salva ripulito.
- `PUT /books/{id}/tags`: id ripetuti contano una volta; un id di un'altra libreria o inesistente → 404 e nulla cambia; tutto in una transazione.
- `book_count` in `TagOut` con una sola query.
- Controlla che backup e ripristino comprendano già `tags` e `book_tags`; se `book_tags` manca, fermati e dillo (il file `backup.rs` non è tuo).

## Test

`tests/tags_api.rs`: CRUD; doppione con maiuscole diverse → 409 `tag_exists`; colore non ammesso → 422; nome vuoto o oltre 40 → 422; cancellare un tag toglie le assegnazioni e non i libri; `PUT` che sostituisce, svuota, rifiuta oltre 20, rifiuta un tag di un'altra libreria senza cambiare nulla; `book_count`; ruolo senza scrittura → 403; isolamento per libreria; voci di audit.
`tests/books_api.rs`: `tags` in elenco, ricerca e dettaglio, ordinati per nome.

## Acceptance criteria

- `cargo test -p bookeeper-core --test tags_api --test books_api --test books_search_api` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- `cargo test -p bookeeper-core --test openapi_errors` passa: ogni rotta nuova documenta gli errori che può dare.
- Cambiano solo: `crates/bookeeper-core/src/api/tags.rs`, `api/books.rs`, `api/books_search.rs`, `api/mod.rs`, `src/openapi.rs`, i test `tags_api.rs`, `books_api.rs`.
