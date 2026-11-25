Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Wishlist: voci personali e conversione in libro

## Obiettivo

Le rotte di `crates/bookeeper-core/src/api/wishlist.rs` elencate nel contratto. Tabella `wishlist`: vedi `src/db/migrations/0001_schema.sql`. La conversione riusa `crate::api::books::{validate_new, insert_in_tx, fetch, CreateBook, BookOut}`.

## Regole

- **Di chi sono le voci.** Ogni voce appartiene a un utente. In questa fase ognuno vede e modifica solo le proprie (la wishlist di famiglia arriva nella fase 6). Una voce di un altro utente, anche della stessa libreria, risponde 404 `not_found` a lettura, modifica, eliminazione e conversione, per chiunque, `owner` compreso.
- **Elenco.** `GET /wishlist`: le proprie, ordinate per `priority` decrescente poi `created_at` decrescente. Risposta `{ "items": [WishOut] }`.
- **Creazione.** Corpo `{ title, isbn?, authors?, source_url?, priority?, notes? }`. `priority` predefinita 0. `isbn` è testo libero fino a 20 caratteri: qui non si controlla la cifra di controllo. `authors` è una stringa libera fino a 500 caratteri.
- **Modifica.** `PATCH` con le regole assente/`null`.
- **Conversione.** `POST /wishlist/{id}/convert`, in una sola transazione:
  1. costruisce un `CreateBook`: `title`; `authors` = la stringa divisa sulle virgole, ogni parte con `trim`, senza le vuote; `isbn_13` se `isbn` è un ISBN-13 valido (`util::normalize_isbn13`), altrimenti `isbn_10` se è un ISBN-10 valido, altrimenti nessun ISBN; `notes` = quelle della voce;
  2. lo valida con `validate_new` e lo inserisce con `insert_in_tx` (che scrive `book.create`);
  3. cancella la voce e scrive `wishlist.convert` con `entity_type: "wishlist"`, l'id della voce e `detail` `{ "book_id": … }`;
  4. risponde 201 con il `BookOut` (`fetch`).

  Se la validazione del libro fallisce → 422 e la voce resta. Convertire due volte la stessa voce: la seconda → 404.
- Scritture: `member` o superiore. Un `guest` può leggere la propria lista (vuota) ma riceve 403 su ogni scrittura.
- **Audit**: `wishlist.create`, `wishlist.update`, `wishlist.delete`, `wishlist.convert`.

`WishOut` e i corpi delle richieste sono `pub` e registrati in `Doc`.

## Test (`crates/bookeeper-core/tests/wishlist_api.rs`)

Usa `mod common;` (`add_user`, `other_library`, `audit_rows`).

- `create_defaults_priority_to_zero`: 201; `user_id` è di chi crea.
- `validation_table`: titolo vuoto, di 301 caratteri; `priority` 3 e -1; `source_url` di 2001 caratteri → 422.
- `list_is_personal_and_ordered`: due utenti della stessa libreria vedono ciascuno solo le proprie; ordine per priorità poi data.
- `patch_changes_and_clears`.
- `delete_removes_the_item`.
- `another_users_item_is_not_found_even_for_the_owner_role`: lettura tramite elenco assente, e `PATCH`, `DELETE`, `convert` → 404.
- `convert_creates_a_book_and_removes_the_item`: 201 `BookOut`; `GET /books/{id}` lo trova; la voce non è più in elenco.
- `convert_splits_authors_on_commas`: `"Eco, Umberto ,, Calvino"` → `["Eco", "Umberto", "Calvino"]`.
- `convert_maps_the_isbn`: ISBN-13 valido con trattini → `isbn_13`; ISBN-10 valido → `isbn_10`; testo qualsiasi → entrambi `null`.
- `converted_book_is_searchable`: dopo la conversione `SELECT rowid FROM books_fts WHERE books_fts MATCH …` trova il titolo.
- `convert_twice_is_not_found`.
- `convert_is_atomic`: una voce il cui titolo, inserito con SQL diretto, ha 400 caratteri → 422, nessun libro creato, la voce c'è ancora.
- `guest_cannot_write`; `routes_need_a_token`.
- `mutations_are_audited`: dopo una conversione ci sono `book.create` e `wishlist.convert`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test wishlist_api` passa con tutti i test elencati.
- Solo `api/wishlist.rs` e `tests/wishlist_api.rs` sono cambiati.
- Le cinque rotte compaiono in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
