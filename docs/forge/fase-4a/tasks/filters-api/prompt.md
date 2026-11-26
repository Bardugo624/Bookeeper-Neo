Leggi prima `docs/forge/fase-4a/CONTRATTO.md` e i contratti della fase 1 che cita. Leggi `crates/bookeeper-core/src/db/migrations/0001_schema.sql`, `src/db/mod.rs`, `src/api/mod.rs`, `src/openapi.rs`, `src/auth/guard.rs` e un modulo di rotte esistente con i suoi test (`src/api/wishlist.rs`, `tests/wishlist_api.rs`) per forma, errori, audit e isolamento.

# Core: filtri avanzati, ordinamenti, faccette

Implementa la sezione "Filtri" del contratto, per intero.

## Punti da non sbagliare

- Le task `reading-api`, `tags-api` e `rooms-api` sono già unite.
- Elenco e ricerca full-text DEVONO accettare gli stessi filtri e ordinamenti: una sola funzione costruisce le condizioni SQL per entrambi. Nessun valore dell'utente entra nel testo SQL: solo parametri; i nomi di colonna per `sort` vengono da una tabella fissa.
- `tag_id` ripetuto: il libro ha TUTTI i tag indicati (al più 10; di più → 422).
- `reading=none`: libri senza stato per chi chiama. Gli altri valori: stato di chi chiama.
- `room_id`: libri collocati in uno scaffale di quella stanza.
- Intervalli: `year_from > year_to` → 422; estremi inclusi.
- Valori assenti in fondo in entrambi i versi dell'ordinamento; a parità, ordine stabile per `id`.
- `total` rispetta i filtri.
- `GET /books/facets`: i conteggi riguardano tutta la libreria, non il filtro corrente; `reading` riguarda chi chiama; al più 200 voci per generi e lingue, le più frequenti prima; generi e lingue raggruppati senza distinguere le maiuscole, mostrando la grafia più frequente.
- Controlla il piano di esecuzione delle query nuove con una libreria di 10.000 libri generati nel test: l'elenco filtrato risponde in meno di 300 ms nel test (segna il test `#[ignore]` se nell'ambiente è troppo lento, e dichiaralo).

## Test

`tests/books_search_api.rs`: ogni filtro da solo; combinazioni (tag + stanza + lettura + anno); `tag_id` doppio in AND; `reading=none`; intervalli inclusivi e invertiti; ogni ordinamento nei due versi con valori assenti in fondo; gli stessi filtri dentro la ricerca full-text; `total`; parametro sconosciuto ignorato come oggi; valore non valido → 422.
`tests/facets_api.rs`: conteggi per ogni faccetta; raggruppamento senza maiuscole; `reading` diverso per due utenti; libreria vuota; isolamento.

## Acceptance criteria

- `cargo test -p bookeeper-core --test books_search_api --test facets_api --test books_api` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- `cargo test -p bookeeper-core --test openapi_errors` passa: ogni rotta nuova documenta gli errori che può dare.
- Cambiano solo: `crates/bookeeper-core/src/api/books.rs`, `api/books_search.rs`, `api/facets.rs`, `api/mod.rs`, `src/openapi.rs`, i test `books_search_api.rs`, `facets_api.rs`.
