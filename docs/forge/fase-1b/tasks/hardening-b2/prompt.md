Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Correggere i difetti P3 del run 1B: prestiti, statistiche, wishlist

## Obiettivo

Chiudere i difetti che i revisori del run 1B hanno confermato sotto la soglia di blocco in `api/loans.rs`, `api/stats.rs` e nei test della wishlist. Ogni correzione ha il suo test.

## Correzioni

1. **Prestito restituito prima di essere prestato** (`api/loans.rs`). `PATCH /loans/{id}` controlla `due_at` contro `lent_at` ma non `returned_at`. Regola: su un prestito restituito, `lent_at` non può superare `returned_at` → 422 `validation`, nulla cambia.

2. **Restituzione senza corpo** (`api/loans.rs`). `POST /loans/{id}/return` senza corpo e senza `content-type` dà 400, anche se ogni campo è facoltativo. Regola: il corpo è facoltativo. Accetta: nessun corpo, corpo vuoto, `{}`, `{"returned_at": …}`. Un corpo presente ma malformato resta 400 `bad_request`. Nella specifica OpenAPI il corpo della rotta risulta non obbligatorio. Non cambiare `crate::extract::ApiJson`: risolvi dentro `loans.rs` (per esempio con un estrattore locale che legge i byte e decide).

3. **Autore contato due volte** (`api/stats.rs`). In `top_authors` un libro che elenca lo stesso autore in due grafie (`"Umberto Eco"` e `"umberto eco"`) conta due volte. Regola: per ogni autore, confrontato senza distinguere maiuscole e dopo `trim`, si contano i **libri distinti**. La grafia mostrata resta la più frequente; a parità, la prima in ordine alfabetico. Lo stesso libro non conta due volte nemmeno in `total_authors` (che conta autori distinti e già lo rispetta: verifica con un test).

4. **Ordinamento della wishlist non verificato** (`tests/wishlist_api.rs`). `list_is_personal_and_ordered` controlla solo il conteggio e il primo elemento. Rendilo stringente: tre voci dello stesso utente, una a priorità 2 e due a priorità 0 con `created_at` diversi (impostati con SQL diretto) → l'ordine esatto degli id è priorità 2, poi la più recente a priorità 0, poi la più vecchia. Il codice della wishlist non cambia: se il test stringente fallisce, fermati e dillo nel messaggio finale.

## Test

- `tests/loans_api.rs`: `lent_at_cannot_pass_returned_at`; `return_without_a_body_uses_now` (nessun corpo, nessun `content-type` → 200 e `returned_at` circa ora); `return_with_an_empty_object_uses_now`; `return_with_malformed_json_is_bad_request`; `return_body_is_optional_in_openapi` (in `bookeeper_core::openapi()` il `requestBody` di quella rotta non è `required`).
- `tests/stats_api.rs`: `top_authors_counts_each_book_once_per_author` (un libro con le due grafie → `count: 1`); `total_authors_ignores_duplicate_spellings_in_one_book`.
- `tests/wishlist_api.rs`: `list_is_personal_and_ordered` reso stringente come sopra.

`common::call` invia sempre `content-type: application/json` quando c'è un corpo e nessun corpo altrimenti: per il caso "nessun corpo" basta passare `None`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test loans_api --test stats_api --test wishlist_api` passa, con i test nuovi e tutti i vecchi.
- Cambiano solo: `api/loans.rs`, `api/stats.rs` e i tre file di test citati.
- `crates/bookeeper-core/src/extract.rs` e `src/api/wishlist.rs` non sono cambiati.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
