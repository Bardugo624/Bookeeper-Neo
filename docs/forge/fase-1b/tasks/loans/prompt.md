Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Prestiti: crea, modifica, restituisci, riapri

## Obiettivo

Le rotte di `crates/bookeeper-core/src/api/loans.rs` elencate nel contratto. Tabella `loans`: vedi `src/db/migrations/0001_schema.sql`. Questa task non usa `api/books.rs`: titolo e autori per `LoanOut` si leggono con un `JOIN` diretto su `books` (`authors_json` → `book_authors`).

## Regole

- **Creazione.** Corpo `{ book_id, borrower_name, lent_at?, due_at?, notes? }`. `lent_at` predefinito ora. Il libro deve esistere nella libreria (altrimenti 404). Se ha già un prestito aperto → 409 `book_already_lent`. L'indice unico `idx_loans_one_open` lo garantisce anche sotto concorrenza: trasforma la sua violazione in quel 409, mai in un 500. `borrower_user_id` resta `null` in questa fase.
- **Elenco.** `status=active` (predefinito: `returned_at IS NULL`), `returned`, `overdue` (aperti con `due_at < ora`), `all`. Più `book_id` facoltativo per lo storico di un libro, e `limit`/`offset`. Ordine: gli aperti per `due_at` crescente con i senza scadenza in fondo, poi `lent_at` decrescente; i restituiti per `returned_at` decrescente. Valore di `status` sconosciuto → 422.
- **Modifica.** `PATCH` su `borrower_name`, `lent_at`, `due_at`, `notes`, con le regole assente/`null`. `due_at` non può precedere `lent_at` → 422. `book_id` non si cambia: se presente nel corpo → 422.
- **Restituzione.** `POST /loans/{id}/return` con `{ returned_at? }` (predefinito ora; non può precedere `lent_at` → 422). Restituire un prestito già restituito → 200 con lo stato attuale, senza cambiare la data.
- **Riapertura.** `POST /loans/{id}/reopen` azzera `returned_at`. Se nel frattempo il libro ha un altro prestito aperto → 409 `book_already_lent`. Riaprire un prestito già aperto → 200 senza cambi.
- **Eliminazione.** 204.
- `overdue` in `LoanOut` si calcola alla lettura.
- **Audit**: `loan.create`, `loan.update`, `loan.delete`, `loan.return`, `loan.reopen`. Restituzione e riapertura che non cambiano nulla non lasciano righe.

`LoanOut` e i corpi delle richieste sono `pub` e registrati in `Doc`.

## Test (`crates/bookeeper-core/tests/loans_api.rs`)

Usa `mod common;` (`insert_book`, `other_library`, `audit_rows`).

- `create_defaults_lent_at_to_now`: 201; `book_title` e `book_authors` giusti; `returned_at: null`; `overdue: false`.
- `book_must_exist_in_this_library`: id sconosciuto e libro di un'altra libreria → 404.
- `second_open_loan_is_conflict`: 409 `book_already_lent`; dopo la restituzione un nuovo prestito riesce.
- `concurrent_loans_one_wins`: due `POST` insieme per lo stesso libro → un 201 e un 409.
- `validation_table`: nome vuoto, di 121 caratteri; `due_at` prima di `lent_at` → 422.
- `list_defaults_to_active`; `list_by_status`: un aperto, un aperto scaduto, un restituito → `active` 2, `overdue` 1, `returned` 1, `all` 3; `status=foo` → 422.
- `list_by_book_id_gives_its_history`.
- `active_loans_are_ordered_by_due_date_with_open_ended_last`.
- `overdue_flag`: `due_at` nel passato → `true`; restituito → `false`.
- `patch_changes_and_clears`: `notes: null` svuota; `book_id` nel corpo → 422.
- `return_sets_the_date_once`: la seconda restituzione non cambia `returned_at`.
- `return_before_lent_at_is_validation`.
- `reopen_clears_the_date`; `reopen_conflicts_when_the_book_is_lent_again`.
- `delete_removes_the_loan`.
- `deleting_the_book_removes_its_loans`: via SQL diretto sul libro, poi l'elenco `all` è vuoto.
- `other_library_gets_not_found`; `guest_can_read_but_not_write`; `routes_need_a_token`.
- `mutations_are_audited`: le cinque azioni; restituzione ripetuta senza riga in più.

## Acceptance criteria

- `cargo test -p bookeeper-core --test loans_api` passa con tutti i test elencati.
- Solo `api/loans.rs` e `tests/loans_api.rs` sono cambiati.
- Le sei rotte compaiono in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
