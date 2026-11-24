Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Fondamenta del run 1C: dipendenze, cartelle dei file, tipi del lookup

## Obiettivo

Preparare il core perché le altre task non tocchino `Cargo.toml`, `state.rs`, `lib.rs` né i due eseguibili.

## Cosa fare

1. **Dipendenze** in `crates/bookeeper-core/Cargo.toml` (ultime stabili compatibili), poi `Cargo.lock`:
   - `reqwest` senza feature predefinite, con `rustls-tls` e `json` (niente OpenSSL);
   - `async-trait`; `image` con solo `jpeg`, `png`, `webp`; `zip` (compressione deflate); `csv`;
   - `printpdf`; `datamatrix`; `unicode-normalization`; `scraper`.
   Nessun'altra task potrà aggiungerne: se una non compila, risolvilo qui. Verifica che `cargo tree -p bookeeper-core | grep -i openssl` non trovi nulla.

2. **`AppState`** (`state.rs`): i campi e i due costruttori del contratto. `open(db, policy)` resta con la stessa firma e mette i file sotto una cartella unica in `std::env::temp_dir()` (nome con un UUID). `open_with_data` crea le due sottocartelle; un errore di I/O diventa `DbError::Io { path, source }` (nuova variante in `db/mod.rs`). `for_tests()` imposta `allow_private_fetch = true`. Il `Debug` manuale continua a nascondere il segreto.

3. **Moduli nuovi**, dichiarati in `lib.rs`:
   - `lookup/mod.rs` con `Metadata`, `Provider`, `ProviderError`, `LookupService` esattamente come nel contratto. Per ora `LookupService::lookup` restituisce `None`.
   - `lookup/google.rs`, `lookup/openlibrary.rs`, `lookup/annas.rs`: ognuno con una struct (`GoogleBooks`, `OpenLibrary`, `AnnasArchive`), `pub fn new(http: reqwest::Client) -> Self`, e un `impl Provider` che per ora restituisce `Ok(None)` e il `name()` del contratto. `LookupService::new` li mette nell'ordine Google, Anna's, Open Library.
   - `covers.rs`, `import.rs`, `backup.rs`, `labels.rs`: solo il commento di modulo.

4. **Eseguibili**: `crates/bookeeper-server/src/lib.rs` passa la cartella dati a `open_with_data`; `apps/desktop/src-tauri/src/lib.rs` passa la cartella dati dell'app.

## Test (`crates/bookeeper-core/tests/plumbing_c.rs`)

- `open_with_data_creates_the_folders`: in una cartella temporanea esistono `covers/` e `backups/`.
- `open_with_data_reports_the_path_on_failure`: `data_dir` sotto un file → `Err(DbError::Io { .. })` il cui messaggio contiene il percorso.
- `open_uses_a_unique_temp_folder_each_time`: due `AppState::open` hanno `covers_dir` diversi ed esistenti.
- `for_tests_allows_private_fetch_and_open_with_data_does_not`.
- `http_client_sends_the_user_agent`: un server locale su `127.0.0.1:0` riceve `User-Agent` che inizia con `Bookeeper/`.
- `lookup_service_lists_providers_in_order`: i `name()` sono `google-books`, `annas-archive`, `open-library` (aggiungi `pub fn provider_names(&self) -> Vec<&'static str>`).
- `stub_lookup_returns_none`.
- `metadata_serializes_with_snake_case_and_nulls`: un `Metadata::default()` in JSON ha `title: null`, `authors: []`, `cover_candidates: []`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test plumbing_c` passa con gli otto test.
- `cargo test -p bookeeper-core --test plumbing --test setup_api --test limits` passa senza modifiche a quei file.
- `cargo test -p bookeeper-server --test serve --test setup_code` passa.
- `cargo check -p bookeeper-desktop` compila.
- Nessuna dipendenza da OpenSSL.
- `cargo clippy -p bookeeper-core -p bookeeper-server --all-targets -- -D warnings` è pulito.
