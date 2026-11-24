# Contratto del run 1B

Valgono tutte le **regole comuni**, le **convenzioni dell'API** e la **tabella degli errori** di `docs/forge/fase-1a/CONTRATTO.md`. Qui ci sono solo le aggiunte. Dove i due file divergono, vince questo.

## Regole aggiunte

- Nessuna task modifica `Cargo.toml` né `Cargo.lock`: le dipendenze ci sono già (`uuid`, `serde_json`, `chrono`, `rusqlite`).
- Solo `skeleton-b` modifica `lib.rs`, `api/mod.rs`, `openapi.rs`, `tests/common/mod.rs`.
- Ogni query su una tabella di dominio filtra per `library_id = <quello di AuthUser>`. Un `id` inesistente, malformato o di un'altra libreria risponde 404 `not_found`.
- Letture: ogni ruolo. Scritture: `member` o superiore (`who.require(Role::Member)?`); un `guest` riceve 403 `forbidden`.
- Ogni scrittura avviene in una transazione `rusqlite::Transaction` (mai `BEGIN` a mano) e chiama `crate::audit::record` dentro la stessa transazione.
- Parametri di query: estrattore `crate::api::util::ApiQuery<T>`. Tempo e identificativi: `crate::api::util::{now_secs, new_id}`.
- `PATCH`: un campo assente resta com'è; un campo `null` svuota il valore (solo per i campi facoltativi; `null` su un campo obbligatorio → 422).
- Liste: `limit` da 1 a 200 (predefinito 50), `offset` ≥ 0; risposta `{ "items": [...], "total": <conteggio senza limit> }`.

## Errori aggiunti

| Stato | `error_code` | Quando |
| --- | --- | --- |
| 409 | `progressive_taken` | numero progressivo già usato nella libreria |
| 409 | `slot_taken` | posto dello scaffale già occupato |
| 409 | `shelf_too_small` | ridurre lo scaffale lascerebbe libri fuori |
| 409 | `book_already_lent` | il libro ha già un prestito aperto |
| 413 | `payload_too_large` | corpo della richiesta oltre il limite |

## Azioni di audit

`book.create`, `book.update`, `book.delete`, `shelf.create`, `shelf.update`, `shelf.delete`, `shelf.place`, `shelf.unplace`, `loan.create`, `loan.update`, `loan.delete`, `loan.return`, `loan.reopen`, `wishlist.create`, `wishlist.update`, `wishlist.delete`, `wishlist.convert`. `entity_type`: `book`, `shelf`, `loan`, `wishlist`.

## Oggetti

```
Placement  { shelf_id, row_index, slot_index }
BookOut    { id, isbn_13, isbn_10, title, subtitle, authors: [string], publisher, published_year, language,
             page_count, description, genre, format, progressive_number, condition, acquired_at, price_cents,
             notes, cover_color, placement: Placement|null, on_loan: bool, created_at, updated_at }
ShelfOut   { id, name, rows, slots_per_row, color, icon, label_code, room_id, capacity, book_count, created_at, updated_at }
ShelfBook  { book_id, title, authors: [string], progressive_number, cover_color, row_index, slot_index, spine_width }
LoanOut    { id, book_id, book_title, book_authors: [string], borrower_name, borrower_user_id, lent_at, due_at,
             returned_at, notes, overdue: bool }
WishOut    { id, user_id, isbn, title, authors, source_url, priority, notes, created_at }
```

I campi facoltativi senza valore sono `null`, mai assenti. `capacity = rows * slots_per_row`. `overdue` = prestito aperto con `due_at` nel passato.

## Validazione

| Campo | Regola |
| --- | --- |
| `title` | 1–300 caratteri dopo `trim` |
| `authors` | al più 20 voci, ognuna 1–200 caratteri; predefinito `[]` |
| `isbn_13` | 13 cifre dopo aver tolto spazi e trattini, cifra di controllo valida; salvato senza trattini |
| `isbn_10` | 10 caratteri (l'ultimo può essere `X`), cifra di controllo valida |
| `published_year` | 1–2100 · `page_count` 1–50000 · `price_cents` ≥ 0 · `progressive_number` ≥ 1 |
| `format` | `hardcover`, `paperback`, `ebook`, `audiobook` |
| testi liberi | `subtitle`, `publisher`, `genre`, `condition` ≤ 300; `language` ≤ 35; `description`, `notes` ≤ 10000 |
| scaffale | `name` 1–80; `rows` 1–12; `slots_per_row` 5–60; `color` tra `sage terracotta night plum amber graphite`; `icon` ≤ 40; `spine_width` 1–3 |
| prestito | `borrower_name` 1–120; `due_at` ≥ `lent_at` |
| wishlist | `title` 1–300; `priority` 0–2; `source_url` ≤ 2000 |

Ogni violazione: 422 `validation`.

## Rotte

| Metodo e percorso | Modulo | Risposta |
| --- | --- | --- |
| `POST /books` | `books` | 201 `BookOut` |
| `GET /books/{id}` · `PATCH /books/{id}` | `books` | 200 `BookOut` |
| `DELETE /books/{id}` | `books` | 204 |
| `POST /books/batch-delete` `{ids}` (al più 500) | `books` | 200 `{deleted}` |
| `GET /books/next-progressive` | `books` | 200 `{next}` |
| `GET /books` | `books_search` | 200 `{items: [BookOut], total}` |
| `GET /shelves` | `shelves` | 200 `{items: [ShelfOut]}` |
| `POST /shelves` | `shelves` | 201 `ShelfOut` |
| `GET /shelves/{id}` · `PATCH /shelves/{id}` | `shelves` | 200 `ShelfOut` |
| `DELETE /shelves/{id}` | `shelves` | 204 |
| `GET /shelves/{id}/books` | `shelves` | 200 `{items: [ShelfBook]}` |
| `PUT /books/{id}/placement` `{shelf_id, row_index, slot_index, spine_width?}` | `shelves` | 200 `Placement` |
| `DELETE /books/{id}/placement` | `shelves` | 204 |
| `POST /shelves/{id}/batch-assign` `{book_ids}` | `shelves` | 200 `{placed: [{book_id,row_index,slot_index}], skipped_already_placed, skipped_no_space}` |
| `GET /loans?status=active\|returned\|overdue\|all` | `loans` | 200 `{items: [LoanOut], total}` |
| `POST /loans` | `loans` | 201 `LoanOut` |
| `PATCH /loans/{id}` | `loans` | 200 `LoanOut` |
| `DELETE /loans/{id}` | `loans` | 204 |
| `POST /loans/{id}/return` `{returned_at?}` · `POST /loans/{id}/reopen` | `loans` | 200 `LoanOut` |
| `GET /wishlist` | `wishlist` | 200 `{items: [WishOut]}` |
| `POST /wishlist` | `wishlist` | 201 `WishOut` |
| `PATCH /wishlist/{id}` | `wishlist` | 200 `WishOut` |
| `DELETE /wishlist/{id}` | `wishlist` | 204 |
| `POST /wishlist/{id}/convert` | `wishlist` | 201 `BookOut` |
| `GET /stats` | `stats` | 200 `Stats` |
