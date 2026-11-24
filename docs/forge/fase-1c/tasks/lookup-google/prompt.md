Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Lookup: fornitore Google Books

## Obiettivo

Implementare il fornitore `GoogleBooks` in `crates/bookeeper-core/src/lookup/google.rs`, portando in Rust la logica di `server/internal/lookup/google_books.go` della 0.3 (sola lettura). Tipi `Metadata`, `Provider`, `ProviderError`: vedi il contratto.

## Forma

```rust
impl GoogleBooks {
    pub fn new(http: reqwest::Client) -> Self;
    /// Per i test: stesso fornitore, ma con un altro indirizzo di base.
    pub fn with_base_url(http: reqwest::Client, base_url: &str) -> Self;
}
/// Funzione pura: dal corpo della risposta al risultato. Nessun accesso alla rete.
pub fn parse(body: &str, isbn_13: &str) -> Result<Option<Metadata>, ProviderError>;
```

`Provider::lookup` fa la richiesta con `self.http` e passa il corpo a `parse`.

## Regole

- Richiesta: `GET {base}/books/v1/volumes?q=isbn:{isbn}` (base predefinita `https://www.googleapis.com`).
- `totalItems == 0` o `items` assente → `Ok(None)`. Si usa il primo elemento il cui `industryIdentifiers` contiene l'ISBN richiesto; se nessuno lo contiene, il primo.
- Campi da `volumeInfo`: `title`, `subtitle`, `authors`, `publisher`, `publishedDate`, `pageCount` (solo se > 0), `language`, `description`, `categories`, `industryIdentifiers`, `imageLinks`.
- `genre`: la prima categoria, con ` / ` trasformato in ` › ` (come `firstBISACBreadcrumb`).
- Copertine: da `imageLinks`, dalla più grande alla più piccola (`extraLarge`, `large`, `medium`, `small`, `thumbnail`, `smallThumbnail`); per gli URL con `zoom=` aggiungi prima la variante `zoom=0` e togli `&edge=curl` (come `pickGoogleCoverCandidates`). Senza doppioni.
- Stato HTTP 404 → `Ok(None)`. Stato 429 o 5xx, corpo illeggibile, errore di rete → `Err(ProviderError)`.
- Ogni stringa passa per `trim`; una stringa vuota diventa `None`. Gli URL `http://` delle copertine diventano `https://`.
- `published_year`: il primo numero di quattro cifre tra 1000 e 2100 trovato nella data; nient'altro.
- La descrizione è testo semplice: i tag HTML vengono tolti e le entità decodificate.
- Nessun `unwrap()` su dati del fornitore: un campo mancante o di tipo inatteso è semplicemente assente.

## Test (`crates/bookeeper-core/tests/lookup_google.rs`)

File di prova in `crates/bookeeper-core/tests/fixtures/google/`, scritti a mano nella forma che il fornitore restituisce davvero (ricavala dal file Go e dalla documentazione pubblica; non accedere alla rete).

- `parses_a_full_volume`: ogni campo del contratto valorizzato come atteso.
- `picks_the_item_matching_the_isbn`: due elementi, il secondo ha l'ISBN richiesto.
- `zero_items_is_none`.
- `year_is_extracted_from_partial_dates`: `"1980"`, `"1980-05"`, `"1980-05-12"` → 1980; `"n.d."` → `None`.
- `cover_candidates_prefer_large_and_force_https`.
- `category_becomes_a_breadcrumb`.
- `html_in_description_is_stripped`.
- `missing_volume_info_fields_are_absent`.
- `not_found_status_is_none` e `server_error_is_an_error`: contro un server locale su `127.0.0.1:0` usando `with_base_url`.
- `request_carries_the_isbn`: il server locale riceve l'ISBN richiesto nel percorso o nella query.
- `malformed_body_is_an_error_not_a_panic`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test lookup_google` passa con tutti i test elencati, senza accesso alla rete.
- Cambiano solo `lookup/google.rs`, il file di test e i file sotto `tests/fixtures/google/`.
- `name()` restituisce `google-books`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
