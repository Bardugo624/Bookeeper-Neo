Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Libri: creazione, lettura, modifica, eliminazione, numero progressivo

## Obiettivo

Le rotte di `crates/bookeeper-core/src/api/books.rs`: `POST /books`, `GET /books/{id}`, `PATCH /books/{id}`, `DELETE /books/{id}`, `POST /books/batch-delete`, `GET /books/next-progressive`. La lista `GET /books` è di un'altra task (`books-search`). Tabelle `books` e `books_fts`: vedi `src/db/migrations/0001_schema.sql`.

## Regole

- **Creazione.** Corpo: i campi di `BookOut` tranne `id`, `cover_color`, `placement`, `on_loan`, `created_at`, `updated_at`. Solo `title` è obbligatorio. `authors` è salvato in `authors_json`. Più copie con lo stesso ISBN sono ammesse.
- **Numero progressivo.** Non è assegnato in automatico. Se presente e già usato nella libreria → 409 `progressive_taken`. `GET /books/next-progressive` → `{ "next": <massimo + 1, oppure 1> }`.
- **Modifica.** `PATCH` con le regole assente/`null` del contratto. `updated_at` cambia. Un `PATCH` con corpo `{}` è valido e non cambia nulla tranne `updated_at`.
- **Eliminazione.** Cancella il libro; collocazione, prestiti e tag spariscono per le chiavi esterne. `batch-delete`: al più 500 id, in una transazione; gli id inesistenti o di un'altra libreria sono ignorati; risposta `{ "deleted": <quanti> }`. Lista vuota → `{ "deleted": 0 }`. Più di 500 → 422.
- **`placement` e `on_loan`** in `BookOut` si leggono con un `LEFT JOIN` su `shelf_books` e sui prestiti aperti.
- **Indice full-text.** `books_fts` è senza contenuto, con `rowid` uguale al `rowid` di `books`. Colonne: `title`, `subtitle`, `authors` (autori separati da spazio), `description`, `notes`, `isbn` (ISBN-13 e ISBN-10 separati da spazio). A ogni creazione inserisci la riga; a ogni modifica cancella e reinserisci; a ogni eliminazione cancella. Sempre nella stessa transazione della modifica.

## Funzioni pubbliche per le altre task

```rust
pub struct NewBook { /* i campi della creazione, già validati */ }
/// Valida un corpo di creazione. Usata anche dalla conversione della wishlist.
pub fn validate_new(input: CreateBook) -> ApiResult<NewBook>;
/// Inserisce libro e riga full-text e scrive l'audit `book.create`. Restituisce l'id.
pub fn insert_in_tx(tx: &rusqlite::Transaction<'_>, who: &AuthUser, book: &NewBook, now: i64) -> rusqlite::Result<Result<String, ApiError>>;
/// Legge un BookOut della libreria.
pub fn fetch(conn: &rusqlite::Connection, library_id: &str, id: &str) -> rusqlite::Result<Option<BookOut>>;
pub const SELECT_BOOK: &str;                                   // SELECT … FROM books b LEFT JOIN … (senza WHERE)
pub fn map_book(row: &rusqlite::Row<'_>) -> rusqlite::Result<BookOut>;
```

`BookOut`, `Placement`, `CreateBook` sono `pub` e registrati in `Doc`.

## Test (`crates/bookeeper-core/tests/books_api.rs`)

Usa `mod common;`.

- `create_with_only_a_title`: 201; i facoltativi sono `null`, `authors` è `[]`, `on_loan` è falso, `placement` è `null`.
- `create_with_every_field_round_trips`: ogni campo torna uguale; `isbn_13` con trattini torna senza.
- `validation_table`: titolo vuoto, di soli spazi, di 301 caratteri; ISBN-13 con cifra di controllo errata; 21 autori; anno 0 e 2101; `format: "tablet"`; `price_cents: -1` → 422, nulla creato.
- `duplicate_isbn_is_allowed`.
- `progressive_must_be_unique_per_library`: 409 `progressive_taken`; lo stesso numero in un'altra libreria va.
- `next_progressive`: 1 a libreria vuota; 8 dopo un libro con 7.
- `patch_changes_only_what_is_sent`; `patch_null_clears_optional_fields`; `patch_null_on_title_is_validation`; `patch_bumps_updated_at`.
- `patch_to_a_taken_progressive_is_conflict`.
- `delete_removes_the_book`: poi `GET` → 404.
- `batch_delete_ignores_foreign_and_unknown_ids`: `deleted` conta solo i propri; il libro dell'altra libreria esiste ancora.
- `batch_delete_over_500_is_validation`.
- `other_library_cannot_read_patch_or_delete`: 404 `not_found` nei tre casi.
- `guest_can_read_but_not_write`: `GET` 200; `POST`, `PATCH`, `DELETE`, `batch-delete` → 403 `forbidden`.
- `routes_need_a_token`.
- `fts_row_follows_the_book`: dopo la creazione `SELECT rowid FROM books_fts WHERE books_fts MATCH 'parola'` trova il libro; dopo un `PATCH` del titolo trova il nuovo e non il vecchio; dopo l'eliminazione non trova nulla.
- `mutations_are_audited`: `audit_rows` contiene `book.create`, `book.update`, `book.delete` con l'id giusto; una creazione fallita (409) non lascia righe.

## Acceptance criteria

- `cargo test -p bookeeper-core --test books_api` passa con tutti i test elencati.
- Solo `api/books.rs` e `tests/books_api.rs` sono cambiati.
- Le sei rotte compaiono in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
