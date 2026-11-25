Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Lookup: fornitore Open Library

## Obiettivo

Implementare il fornitore `OpenLibrary` in `crates/bookeeper-core/src/lookup/openlibrary.rs`, portando in Rust la logica di `server/internal/lookup/open_library.go` della 0.3 (sola lettura). Tipi `Metadata`, `Provider`, `ProviderError`: vedi il contratto.

## Forma

```rust
impl OpenLibrary {
    pub fn new(http: reqwest::Client) -> Self;
    /// Per i test: stesso fornitore, ma con un altro indirizzo di base.
    pub fn with_base_url(http: reqwest::Client, base_url: &str) -> Self;
}
/// Funzione pura: dal corpo della risposta al risultato. Nessun accesso alla rete.
pub fn parse(body: &str, isbn_13: &str) -> Result<Option<Metadata>, ProviderError>;
```

`Provider::lookup` fa la richiesta con `self.http` e passa il corpo a `parse`.

## Regole

- Richiesta: `GET {base}/api/books?bibkeys=ISBN:{isbn}&jscmd=data&format=json` (base predefinita `https://openlibrary.org`).
- La risposta è un oggetto con la chiave `ISBN:{isbn}`. Oggetto vuoto o chiave assente → `Ok(None)`.
- Campi: `title`, `subtitle`, `authors[].name`, `publishers[0].name`, `publish_date`, `number_of_pages` (solo se > 0), `identifiers.isbn_10[0]`, `identifiers.isbn_13[0]`, `subjects[0].name` come `genre`, `excerpts[0].text` o `notes` come `description`.
- `language`: Open Library non lo dà in questa risposta: resta `None`.
- Copertine: `cover.large`, poi `cover.medium`, poi sempre in coda `https://covers.openlibrary.org/b/isbn/{isbn}-L.jpg?default=false` (con `default=false` il sito risponde 404 invece di un segnaposto).
- Stato HTTP 404 → `Ok(None)`. Stato 429 o 5xx, corpo illeggibile, errore di rete → `Err(ProviderError)`.
- Ogni stringa passa per `trim`; una stringa vuota diventa `None`. Gli URL `http://` delle copertine diventano `https://`.
- `published_year`: il primo numero di quattro cifre tra 1000 e 2100 trovato nella data; nient'altro.
- La descrizione è testo semplice: i tag HTML vengono tolti e le entità decodificate.
- Nessun `unwrap()` su dati del fornitore: un campo mancante o di tipo inatteso è semplicemente assente.

## Test (`crates/bookeeper-core/tests/lookup_openlibrary.rs`)

File di prova in `crates/bookeeper-core/tests/fixtures/openlibrary/`, scritti a mano nella forma che il fornitore restituisce davvero (ricavala dal file Go e dalla documentazione pubblica; non accedere alla rete).

- `parses_a_full_record`.
- `empty_object_is_none`.
- `record_under_another_key_is_none`.
- `authors_and_publisher_come_from_name_fields`.
- `year_is_extracted_from_free_text_dates`: `"March 1980"`, `"1980"`, `"12 May, 1980"` → 1980.
- `cover_candidates_end_with_the_isbn_url`.
- `missing_fields_are_absent`.
- `not_found_status_is_none` e `server_error_is_an_error`: contro un server locale su `127.0.0.1:0` usando `with_base_url`.
- `request_carries_the_isbn`: il server locale riceve l'ISBN richiesto nel percorso o nella query.
- `malformed_body_is_an_error_not_a_panic`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test lookup_openlibrary` passa con tutti i test elencati, senza accesso alla rete.
- Cambiano solo `lookup/openlibrary.rs`, il file di test e i file sotto `tests/fixtures/openlibrary/`.
- `name()` restituisce `open-library`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
