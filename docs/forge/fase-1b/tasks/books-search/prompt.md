Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Libri: elenco, ricerca full-text, filtri, ordinamento

## Obiettivo

La rotta `GET /api/v1/books` in `crates/bookeeper-core/src/api/books_search.rs`. Riusa `SELECT_BOOK`, `map_book`, `BookOut` di `crate::api::books`.

## Parametri (tutti facoltativi, con `ApiQuery`)

| Parametro | Effetto |
| --- | --- |
| `q` | ricerca full-text su `books_fts` |
| `genre`, `language`, `format` | uguaglianza esatta |
| `shelf_id` | solo i libri collocati su quello scaffale |
| `unshelved=true` | solo i libri senza collocazione |
| `on_loan=true` \| `false` | solo quelli con, o senza, un prestito aperto |
| `sort` | `created_at` (predefinito), `title`, `author`, `year`, `progressive` |
| `order` | `asc` \| `desc`; predefinito `desc` per `created_at`, `asc` per gli altri |
| `limit`, `offset` | come da contratto (`Page`) |

Risposta: `{ "items": [BookOut], "total": <conteggio con gli stessi filtri, senza limit> }`.

## Regole

- **Sicurezza della ricerca.** `q` non arriva mai a FTS5 così com'è. Spezzalo in parole su spazi e punteggiatura, scarta le vuote, racchiudi ognuna tra virgolette doppie (raddoppiando le virgolette interne) e aggiungi `*` all'ultima per la ricerca per prefisso; uniscile con spazi (AND implicito). Così `"`, `*`, `:`, `(`, `-`, `OR`, `NEAR` scritti dall'utente sono testo, non sintassi. Un `q` che dopo la pulizia è vuoto equivale ad assenza di `q`. Al più 16 parole; le altre sono ignorate.
- I diacritici non contano: l'indice è già `remove_diacritics 2`, quindi `citta` trova `città`.
- Con `q` e senza `sort`, l'ordine è la pertinenza (`bm25`), poi `created_at` decrescente.
- `sort=author` ordina sul primo autore (`json_extract(authors_json, '$[0]')`), i libri senza autori in fondo. `sort=progressive` e `sort=year`: i `NULL` in fondo, in entrambi gli ordini.
- Ogni ordinamento ha `id` come ultimo criterio, così la paginazione è stabile.
- I valori dei parametri entrano nella query solo come parametri legati, mai per concatenazione. I nomi di colonna per `sort` vengono da una tabella fissa.
- Parametri non validi (`sort=foo`, `order=up`, `format=tablet`, `on_loan=maybe`, `shelf_id` e `unshelved=true` insieme) → 422 `validation`.
- Sempre filtrato per la libreria di chi chiede.

## Test (`crates/bookeeper-core/tests/books_search_api.rs`)

Usa `mod common;`. Crea i libri con `POST /api/v1/books` (così l'indice è aggiornato), tranne dove serve SQL diretto.

- `lists_newest_first_by_default`.
- `total_ignores_limit_and_offset`: 5 libri, `limit=2&offset=2` → 2 elementi, `total: 5`.
- `pagination_is_stable_and_complete`: pagine da 2 su 5 libri creati nello stesso secondo coprono tutti gli id senza ripetizioni.
- `search_matches_title_author_isbn_and_notes`.
- `search_is_prefix_on_the_last_word`: `q=gatt` trova "Il Gattopardo".
- `search_ignores_diacritics_and_case`: `q=CITTA` trova "Le città invisibili".
- `search_needs_all_words`: `q=nome rosa` trova "Il nome della rosa" e non "Il nome del vento".
- `hostile_queries_are_harmless`: `q="`, `q=*`, `q=title:x`, `q=a OR b`, `q=NEAR(`, `q=-foo`, `q=)(`, `q=` 500 caratteri → sempre 200, mai 500.
- `empty_or_punctuation_only_query_lists_everything`.
- `filters_combine`: `genre` + `language` + `format` insieme.
- `shelf_id_and_unshelved`: uno collocato (SQL diretto in `shelf_books`), uno no; i due filtri li separano; insieme → 422.
- `on_loan_true_and_false`: prestito aperto inserito con SQL diretto.
- `sort_by_title_author_year_progressive`: ordine giusto in `asc` e `desc`, `NULL` in fondo.
- `invalid_parameters_are_validation`.
- `never_returns_another_library`: anche con `q` che corrisponde a un libro dell'altra libreria.
- `guest_can_list`; `needs_a_token`.

## Correzione richiesta dopo la prima revisione

Il codice di `books_search.rs` ha superato la revisione. Resta un test di un'altra task diventato falso, che ora appartiene a questa task:

- In `crates/bookeeper-core/tests/skeleton_b.rs`, il test `empty_modules_are_mounted` afferma che `GET /api/v1/books` risponde 404. Non è più vero: la rotta esiste. Sostituiscilo con `unknown_api_path_is_not_found`: `GET /api/v1/does-not-exist` con un token valido → 404 `not_found`, e `bookeeper_core::openapi()` si costruisce. Non toccare gli altri test di quel file.


## Acceptance criteria

- `cargo test -p bookeeper-core --test books_search_api` passa con tutti i test elencati.
- Cambiano solo `api/books_search.rs`, `tests/books_search_api.rs` e il test indicato in `tests/skeleton_b.rs`.
- Nessuna stringa SQL è costruita con valori presi dalla richiesta (`format!` solo con frammenti fissi).
- La rotta compare in `bookeeper_core::openapi()` con tutti i parametri.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
- `cargo test -p bookeeper-core --test skeleton_b` passa.
- In `tests/skeleton_b.rs` cambia solo quel test.
