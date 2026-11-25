Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Correggere i difetti P3 del run 1B: limiti, libri, ricerca

## Obiettivo

Chiudere i difetti che i revisori del run 1B hanno confermato sotto la soglia di blocco in `auth/limit.rs`, `api/books.rs`, `api/books_search.rs` e nel test dello scheletro. Ogni correzione ha il suo test.

## Correzioni

1. **`Retry-After` troppo lungo** (`auth/limit.rs`). Quando il limite è raggiunto anche per via di tentativi in corso, l'attesa è calcolata dal fallimento registrato più vecchio e può valere quasi tutta la finestra, mentre un tentativo in corso può liberarsi in un secondo. Regola nuova: se togliendo i tentativi in corso la chiave sarebbe sotto il limite, `retry_after` è 1; altrimenti è il tempo che manca perché il fallimento registrato più vecchio esca dalla finestra, almeno 1.

2. **`ApiQuery` con valori validi** (`tests/skeleton_b.rs`). Il test esistente prova solo `?limit=abc`. Aggiungi `api_query_accepts_valid_values`: una rotta di prova con `ApiQuery<Page>` diretto (senza `#[serde(flatten)]`) e `?limit=5&offset=2` → 200 con `(5, 2)`; senza parametri → `(50, 0)`. Non cambiare gli altri test.

3. **Numero progressivo enorme** (`api/books.rs`). `progressive_number` ha anche un massimo: 1–2147483647; oltre → 422 `validation`. `GET /books/next-progressive` non risponde mai 500: quando il massimo è 2147483647 risponde 409 `progressive_taken`.

4. **`updated_at` in avanti rispetto all'orologio** (`api/books.rs`). Oggi `PATCH` usa `now.max(old + 1)`, e dieci modifiche nello stesso secondo portano la data dieci secondi nel futuro. Regola nuova: `updated_at = max(now, valore precedente)`: non torna mai indietro e non supera mai l'orologio. Adatta `patch_bumps_updated_at` in `tests/books_api.rs`: porta prima `updated_at` nel passato con SQL diretto, poi verifica che il `PATCH` lo porti a circa ora.

5. **`order` ignorato nella ricerca** (`api/books_search.rs`). Con `q` e senza `sort` l'ordine è la pertinenza e `order` non ha senso: rispondi 422 `validation` invece di ignorarlo. Con `q` e `sort` espliciti, `order` vale come sempre.

## Test

- `tests/limits.rs`: `retry_after_is_short_when_only_in_flight_attempts_block` (4 fallimenti registrati con `max_failures: 5`, un `begin` aperto, il `begin` seguente dà `Err(1)`); `retry_after_follows_the_oldest_failure_when_failures_alone_block` (5 fallimenti registrati a `now`, a `now + 100` dà `Err(window_secs - 100)`).
- `tests/skeleton_b.rs`: `api_query_accepts_valid_values`.
- `tests/books_api.rs`: `progressive_above_the_maximum_is_validation`; `next_progressive_at_the_maximum_is_conflict` (il libro con 2147483647 si crea con `POST`); `patch_bumps_updated_at` adattato; `rapid_patches_never_run_ahead_of_the_clock` (dieci `PATCH {}` di fila: `updated_at` non supera ora + 1).
- `tests/books_search_api.rs`: `order_without_sort_on_a_search_is_validation`; `order_with_sort_on_a_search_is_honoured`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test limits --test skeleton_b --test books_api --test books_search_api` passa, con i test nuovi e tutti i vecchi.
- `cargo test -p bookeeper-core --test auth_api --test pairing_api --test setup_api --test wishlist_api` passa ancora senza modifiche a quei file.
- Cambiano solo: `auth/limit.rs`, `api/books.rs`, `api/books_search.rs` e i quattro file di test citati.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
