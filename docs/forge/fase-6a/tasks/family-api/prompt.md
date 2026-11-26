Leggi prima `docs/forge/fase-6a/CONTRATTO.md` (sezioni Regole, Ruoli, Di chi è, Wishlist di famiglia, Prestiti a membri) e `docs/forge/fase-4a/CONTRATTO.md`. La task `people-api` è già unita: parti dal suo codice. Leggi `crates/bookeeper-core/src/api/books.rs`, `books_search.rs`, `facets.rs`, `reading.rs`, `wishlist.rs`, `loans.rs` e i loro test.

# Core: di chi è, chi lo legge, wishlist di famiglia, prestiti a membri

## Cosa fare

1. **Di chi è**: `BookOut.owner`, `owner_user_id` in creazione e modifica, filtro `owner_id`, faccette `owners` e `owner_none`, come da contratto. Ogni punto che costruisce un `BookOut` lo riempie: cerca tutti i punti, non solo `books.rs`.
2. **Chi lo legge**: `GET /books/{id}/readers` in un file nuovo `crates/bookeeper-core/src/api/readers.rs`. Libro di un'altra libreria o inesistente → 404. Valutazione, nota e pagina corrente non compaiono, neanche per chi chiama.
3. **Wishlist di famiglia**: `WishOut.user` e `scope`, come da contratto.
4. **Prestiti a membri**: `borrower_user_id` in creazione e modifica, `LoanOut.borrower`, filtro `borrower_user_id`, come da contratto. Il nome salvato è quello della persona al momento della scrittura.
5. Le letture restano una query per richiesta, senza una query per riga: unisci con `users` nella stessa istruzione.

## Test

File nuovo `crates/bookeeper-core/tests/family_api.rs`, più gli adeguamenti minimi dei test esistenti.

- Proprietario del libro: impostare, togliere, persona di un'altra libreria 404, ospite 403; filtro `owner_id` con un id, `me`, `none`; faccette; persona rimossa → libro senza proprietario.
- Lettori: ordine; campi privati assenti (controlla la forma JSON, non solo i tipi); `is_me`; libro senza lettori → elenco vuoto; 404 per un'altra libreria.
- Wishlist: `mine` come oggi; `family` con voci di tre persone nell'ordine del contratto; ospite con `family`; scritture su voci altrui 404.
- Prestiti: a una persona senza nome → nome della persona salvato; persona di un'altra libreria 404; né nome né persona 422; `PATCH` che toglie la persona; filtro `borrower_user_id` con un id e con `me`; `borrower` con il nome attuale dopo un cambio di nome.

## Acceptance criteria

- `cargo fmt --check` passa.
- `cargo test -p bookeeper-core` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- Cambiano solo file sotto `crates/bookeeper-core/src/api/`, `crates/bookeeper-core/src/openapi.rs`, `crates/bookeeper-core/tests/`, e `packages/api/openapi.json` (aggiornata solo con il comando del contratto).
