Leggi prima `docs/forge/fase-4a/CONTRATTO.md` e i contratti della fase 1 che cita. Leggi `crates/bookeeper-core/src/db/migrations/0001_schema.sql`, `src/db/mod.rs`, `src/api/mod.rs`, `src/openapi.rs`, `src/auth/guard.rs` e un modulo di rotte esistente con i suoi test (`src/api/wishlist.rs`, `tests/wishlist_api.rs`) per forma, errori, audit e isolamento.

# Core: stato di lettura per persona

Implementa la sezione "Stato di lettura" del contratto, per intero.

## Punti da non sbagliare

- La migrazione nuova entra in `MIGRATIONS` in `src/db/mod.rs`; un database della versione precedente si aggiorna all'apertura senza perdere dati (prova con un file creato dalla sola `0001`).
- Lo stato è di chi chiama: la chiave è `(user_id, book_id)`. Un membro non vede né tocca lo stato di un altro, nemmeno il proprietario.
- `reading` in `BookOut` si calcola per chi chiama con una sola query in più per pagina di risultati, non una per libro.
- Le regole di transizione stanno in una funzione pura con i propri test.
- `backup.rs`: controlla che `reading` sia tra le tabelle salvate e ripristinate con `current_page`; un archivio fatto prima di questa migrazione si ripristina ancora (colonna assente → `null`).
- Audit: una voce per `PUT` e per `DELETE`, senza la nota nel dettaglio.

## Test

`tests/reading_api.rs`: creazione, sostituzione, lettura, cancellazione; `null` quando manca; ogni regola di convalida (rating, nota, date, pagina oltre `page_count`); transizioni automatiche (`reading` imposta `started_at`; `read` imposta `finished_at` e la pagina; `to_read` azzera); due utenti della stessa libreria non si vedono; libro di un'altra libreria → 404; un ospite scrive il proprio stato; elenco `GET /reading` con filtro e paginazione; cancellare il libro cancella lo stato.
`tests/books_api.rs`: `reading` presente in elenco, ricerca e dettaglio, diverso per due utenti.
`tests/db.rs`: migrazione da un database alla versione 1.
`tests/backup_api.rs`: andata e ritorno con stati di lettura; archivio vecchio senza `current_page`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test reading_api --test books_api --test db --test backup_api --test backup_schedule` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- `cargo test -p bookeeper-core --test openapi_errors` passa: ogni rotta nuova documenta gli errori che può dare.
- Cambiano solo: file sotto `crates/bookeeper-core/src/db/`, `crates/bookeeper-core/src/api/reading.rs`, `api/books.rs`, `api/books_search.rs`, `api/mod.rs`, `src/openapi.rs`, `src/backup.rs`, i test `reading_api.rs`, `books_api.rs`, `backup_api.rs`, `db.rs`.
