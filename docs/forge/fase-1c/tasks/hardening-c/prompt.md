Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Correggere i difetti rimasti dal run 1B

## Obiettivo

Chiudere i cinque difetti confermati e i due plausibili che i revisori del run 1B hanno lasciato aperti. Ogni correzione ha il suo test.

## Correzioni

1. **Tipo di contenuto nella restituzione** (`api/loans.rs`). `POST /loans/{id}/return` ora accetta un corpo con qualsiasi tipo di contenuto. Regola: senza corpo (o con corpo vuoto) il tipo non conta; con un corpo non vuoto il `content-type` deve essere `application/json` (con o senza parametri come `; charset=utf-8`), altrimenti 400 `bad_request`.

2. **409 assente dalla specifica** (`api/books.rs`). L'annotazione OpenAPI di `GET /books/next-progressive` elenca anche la risposta 409 `progressive_taken`. Non rigenerare `packages/api/openapi.json`: lo fa la task `api-client-c`.

3. **Test che non prova ciò che dice** (`tests/loans_api.rs`). Nel test sul rifiuto di `lent_at` oltre `returned_at`, leggi il prestito subito dopo il `PATCH` rifiutato e verifica che `lent_at` sia quello di prima, prima di qualunque altra modifica.

4. **`PATCH` di un libro rivalida tutto** (`api/books.rs`). Oggi il `PATCH` rivalida l'intero record, quindi un libro con un dato fuori regola già salvato (per esempio un titolo di 400 caratteri arrivato da un import o da SQL diretto) non si può più modificare in nessun campo. Regola: si validano solo i campi presenti nel corpo. I vincoli tra campi (unicità del progressivo) valgono solo se quel campo è nel corpo.

5. **Ricerca con accenti in forma scomposta** (`api/books_search.rs`). Prima di dividere `q` in parole, normalizzalo in NFC con `unicode-normalization`. Così `Pe` + accento combinante + `rez` trova "Pérez" come la forma composta.

6. **Percorsi di eliminazione non verificati** (`packages/api/src/resources.test.ts`). Verifica metodo HTTP e percorso esatto di `deleteBook`, `deleteShelf`, `deleteLoan`, `deleteWish`, oltre a `unplaceBook`.

7. **Tipo doppione** (`packages/api/src/resources/shelves.ts`). Togli `PlacementOut` e usa `Placement`, già esportato dal modulo dei libri. Nessun cambio nell'interfaccia pubblica di `packages/api`.

## Test

- `tests/loans_api.rs`: `return_with_a_non_json_content_type_is_bad_request` (`text/plain` con corpo `{"returned_at": 123}` → 400); `return_accepts_json_with_a_charset`; `return_without_a_body_ignores_the_content_type`; il test del punto 3 reso stringente. Se `common::call` non permette di scegliere il `content-type`, costruisci la richiesta a mano nel test con `tower::ServiceExt::oneshot`.
- `tests/books_api.rs`: `next_progressive_documents_the_conflict` (in `bookeeper_core::openapi()` la rotta ha una risposta `409`); `patch_does_not_revalidate_untouched_fields` (titolo di 400 caratteri messo con SQL diretto; `PATCH {"notes":"x"}` → 200; `PATCH {"title": <400 caratteri>}` → 422).
- `tests/books_search_api.rs`: `decomposed_accents_match_composed_text` (libro "Pérez" in forma composta; `q` in forma scomposta, scritta nel test con `\u{0301}`, lo trova).
- `packages/api/src/resources.test.ts`: i quattro percorsi di eliminazione.

## Acceptance criteria

- `cargo test -p bookeeper-core --test loans_api --test books_api --test books_search_api` passa, con i test nuovi e tutti i vecchi.
- `npm test -w @bookeeper/api` e `npm run typecheck -w @bookeeper/api` passano.
- `grep -rn "PlacementOut" packages/api/src` non trova nulla.
- Cambiano solo: `api/loans.rs`, `api/books.rs`, `api/books_search.rs`, i tre file di test Rust, `packages/api/src/resources/shelves.ts`, `packages/api/src/resources.test.ts`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
