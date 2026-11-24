Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Lookup: fornitore Anna's Archive

## Obiettivo

Implementare il fornitore `AnnasArchive` in `crates/bookeeper-core/src/lookup/annas.rs`, portando in Rust la logica di `server/internal/annas/annas.go e server/internal/lookup/annas_provider.go` della 0.3 (sola lettura). Tipi `Metadata`, `Provider`, `ProviderError`: vedi il contratto.

## Forma

```rust
impl AnnasArchive {
    pub fn new(http: reqwest::Client) -> Self;
    /// Per i test: stesso fornitore, ma con un altro indirizzo di base.
    pub fn with_base_url(http: reqwest::Client, base_url: &str) -> Self;
}
/// Funzione pura: dal corpo della risposta al risultato. Nessun accesso alla rete.
pub fn parse(body: &str, isbn_13: &str) -> Result<Option<Metadata>, ProviderError>;
```

`Provider::lookup` fa la richiesta con `self.http` e passa il corpo a `parse`.

## Regole

- Questo fornitore legge solo **metadati bibliografici e l'URL della copertina** dalla pagina di ricerca pubblica. Non scarica né collega file di libri: nessun URL di download entra mai in `Metadata`.
- Segui `annas.go`: stessa lista di domini specchio, stesso percorso di ricerca per ISBN, stessa estrazione dei campi dall'HTML (con `scraper`). Prova i domini in ordine: il primo che risponde 200 con un risultato vince; se tutti falliscono → `Err`; se uno risponde 200 senza risultati → `Ok(None)`.
- `with_base_url` sostituisce l'intera lista con un solo indirizzo.
- **Reindirizzamenti.** Il client condiviso `state.http` non deve seguirli da solo: in `crates/bookeeper-core/src/state.rs` costruiscilo con `reqwest::redirect::Policy::none()` (unica modifica ammessa a quel file). Questo fornitore li segue a mano, al più 3 salti, e solo verso un dominio della propria lista; un salto verso un altro dominio chiude quel tentativo come guasto di quel dominio. Gli altri fornitori trattano già uno stato 3xx come guasto.
- Limite di 6 secondi per dominio, così tre domini lenti non superano gli 8 secondi che il servizio concede: fermati al primo limite complessivo di 7 secondi.
- Campi che il parser Go ricava: portali tutti nel campo corrispondente di `Metadata`; ciò che non ha un campo corrispondente si scarta.
- Stato HTTP 404 → `Ok(None)`. Stato 429 o 5xx, corpo illeggibile, errore di rete → `Err(ProviderError)`.
- Ogni stringa passa per `trim`; una stringa vuota diventa `None`. Gli URL `http://` delle copertine diventano `https://`.
- `published_year`: il primo numero di quattro cifre tra 1000 e 2100 trovato nella data; nient'altro.
- La descrizione è testo semplice: i tag HTML vengono tolti e le entità decodificate.
- Nessun `unwrap()` su dati del fornitore: un campo mancante o di tipo inatteso è semplicemente assente.

## Test (`crates/bookeeper-core/tests/lookup_annas.rs`)

File di prova in `crates/bookeeper-core/tests/fixtures/annas/`, scritti a mano nella forma che il fornitore restituisce davvero (ricavala dal file Go e dalla documentazione pubblica; non accedere alla rete).

- `parses_a_result_page`: una pagina con un risultato nella struttura che il parser Go si aspetta.
- `page_without_results_is_none`.
- `only_https_cover_urls_are_kept`.
- `no_download_links_leak_into_metadata`: una pagina con link di download: nessun campo di `Metadata` li contiene.
- `falls_back_to_the_next_mirror`: due server locali, il primo risponde 503, il secondo dà il risultato (aggiungi un costruttore di prova `with_mirrors(http, Vec<String>)`).
- `all_mirrors_failing_is_an_error`.
- `shared_client_does_not_follow_redirects`: con `AppState::for_tests().http`, una richiesta a un server locale che risponde 302 restituisce il 302, non la destinazione.
- `redirect_inside_the_mirror_list_is_followed`; `redirect_to_a_foreign_host_is_not_followed` (il secondo server locale non riceve alcuna richiesta).
- `unexpected_html_is_none_or_error_never_a_panic`: HTML qualsiasi, HTML troncato, corpo vuoto.
- `not_found_status_is_none` e `server_error_is_an_error`: contro un server locale su `127.0.0.1:0` usando `with_base_url`.
- `request_carries_the_isbn`: il server locale riceve l'ISBN richiesto nel percorso o nella query.
- `malformed_body_is_an_error_not_a_panic`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test lookup_annas` passa con tutti i test elencati, senza accesso alla rete.
- Cambiano solo `lookup/annas.rs`, il file di test, i file sotto `tests/fixtures/annas/` e la sola costruzione del client in `state.rs`.
- `cargo test -p bookeeper-core --test plumbing_c --test lookup_google --test lookup_openlibrary` passa ancora.
- `name()` restituisce `annas-archive`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
