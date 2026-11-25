Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Scaffali: configurazione, collocazione dei libri, assegnazione multipla

## Obiettivo

Le rotte di `crates/bookeeper-core/src/api/shelves.rs` elencate nel contratto sotto il modulo `shelves`, incluse `PUT` e `DELETE /books/{id}/placement`. Tabelle `shelves` e `shelf_books`: vedi `src/db/migrations/0001_schema.sql`. Questa task non usa `api/books.rs`, che un'altra task sta scrivendo: i titoli per `ShelfBook` si leggono con un `JOIN` diretto su `books`.

## Regole

**Scaffali**
- Creazione: `name`, `rows`, `slots_per_row` obbligatori; `color` predefinito `sage`; `icon` facoltativa. `label_code` è il più piccolo intero ≥ 1 non usato nella libreria, assegnato nella stessa transazione. `room_id` resta `null` (le stanze arrivano più avanti).
- Elenco: ordinato per `label_code`. `book_count` è il numero di libri collocati.
- Modifica: assente/`null` come da contratto. Ridurre `rows` o `slots_per_row` quando un libro collocato resterebbe fuori → 409 `shelf_too_small`, nulla cambia.
- Eliminazione: toglie lo scaffale e le collocazioni; i libri restano, senza collocazione.

**Collocazione**
- `PUT /books/{id}/placement`: colloca o sposta il libro. `row_index` in `0..rows`, `slot_index` in `0..slots_per_row`, altrimenti 422. Posto occupato da un altro libro → 409 `slot_taken`. Rimettere un libro nel posto dove già sta è valido. Un libro sta in un solo posto: spostarlo libera il precedente. `spine_width` facoltativo (1–3); assente lascia quello che c'è, o `NULL` se nuovo.
- Libro o scaffale inesistenti o di un'altra libreria → 404.
- `DELETE /books/{id}/placement`: toglie la collocazione → 204, anche se il libro non era collocato.
- `GET /shelves/{id}/books`: ordinati per `row_index`, poi `slot_index`.

**Assegnazione multipla** (`POST /shelves/{id}/batch-assign`, al più 500 id)
- Colloca i libri, nell'ordine dato, nei posti liberi scorrendo per riga e poi per posto.
- Un libro già collocato su qualunque scaffale è saltato (`skipped_already_placed`). Finiti i posti, i restanti contano in `skipped_no_space`. Gli id inesistenti, di un'altra libreria o ripetuti sono ignorati e non contano in nessun campo.
- Tutto in una transazione: o tutto o niente.

**Concorrenza.** Due richieste che puntano allo stesso posto: una riesce, l'altra riceve 409 `slot_taken`, mai 500. Trasforma la violazione del vincolo `UNIQUE (shelf_id, row_index, slot_index)` in quel 409.

**Audit.** `shelf.create`, `shelf.update`, `shelf.delete`; `shelf.place` con `entity_type: "book"` e l'id del libro per ogni collocazione, anche dentro `batch-assign`; `shelf.unplace`.

`ShelfOut`, `ShelfBook`, `Placement` sono `pub` e registrati in `Doc`. Se `Placement` esiste già in `crate::api::books` quando lavori, riusalo; altrimenti definiscilo qui con gli stessi campi e segnalalo nel messaggio finale.

## Test (`crates/bookeeper-core/tests/shelves_api.rs`)

Usa `mod common;` (`insert_book`, `insert_shelf`, `other_library`, `audit_rows`).

- `create_assigns_label_codes_in_order`: 1, 2, 3; eliminato il 2, il prossimo creato riceve 2.
- `create_defaults_and_capacity`: colore `sage`, `capacity == rows * slots_per_row`, `book_count == 0`.
- `validation_table`: nome vuoto; `rows` 0 e 13; `slots_per_row` 4 e 61; colore `pink` → 422.
- `list_is_ordered_by_label_code_with_book_counts`.
- `patch_renames_and_recolours`.
- `shrinking_below_a_placed_book_is_conflict`: 409 `shelf_too_small`; ridurre senza lasciare fuori nessuno riesce.
- `delete_shelf_keeps_the_books_unplaced`.
- `place_then_move_frees_the_old_slot`.
- `placing_on_a_taken_slot_is_conflict`; `placing_a_book_where_it_already_is_succeeds`.
- `out_of_range_slot_is_validation`: `row_index == rows`, `slot_index` negativo.
- `unplace_is_idempotent`.
- `shelf_books_are_ordered_by_row_then_slot`.
- `batch_assign_fills_free_slots_in_order`: su uno scaffale 1×5 con il posto 1 occupato, tre libri vanno in 0, 2, 3.
- `batch_assign_reports_skipped`: già collocati e senza spazio contati giusti; id sconosciuti e doppi ignorati.
- `concurrent_placement_one_wins`: due `PUT` insieme sullo stesso posto con libri diversi → un 200 e un 409.
- `other_library_gets_not_found_everywhere`: scaffale altrui, libro altrui, e scaffale proprio con libro altrui.
- `guest_can_read_but_not_write`; `routes_need_a_token`.
- `mutations_are_audited`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test shelves_api` passa con tutti i test elencati.
- Solo `api/shelves.rs` e `tests/shelves_api.rs` sono cambiati.
- Le nove rotte compaiono in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
