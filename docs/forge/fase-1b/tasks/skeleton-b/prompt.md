Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Scheletro delle risorse: moduli vuoti, audit, utilità, aiuti per i test

## Obiettivo

Creare i file che le task delle risorse riempiranno in parallelo, più ciò che condividono. Dopo questa task nessuno modifica `lib.rs`, `api/mod.rs`, `openapi.rs`, `tests/common/mod.rs`.

## Cosa fare

1. **Moduli vuoti**, stesso schema di `api/devices.rs` (`pub fn routes() -> axum::Router<AppState>` vuoto e `pub struct Doc` con `#[openapi()]`): `api/books.rs`, `api/books_search.rs`, `api/shelves.rs`, `api/loans.rs`, `api/wishlist.rs`, `api/stats.rs`. Uniscili in `api/mod.rs` e in `openapi.rs`.

2. **`crates/bookeeper-core/src/audit.rs`**, dichiarato in `lib.rs`:

   ```rust
   /// Scrive una riga in audit_log. Va chiamata dentro la transazione della modifica.
   pub fn record(
       conn: &rusqlite::Connection,
       who: &crate::auth::guard::AuthUser,
       action: &str, entity_type: &str, entity_id: &str,
       detail: Option<&serde_json::Value>,
       now: i64,
   ) -> rusqlite::Result<()>;
   ```

   Colonne: `library_id`, `user_id`, `device_id` da `who`; `detail_json` serializzato o `NULL`; `ip` `NULL`; `at = now`.

3. **`crates/bookeeper-core/src/api/util.rs`**, dichiarato in `api/mod.rs`:

   ```rust
   pub fn now_secs() -> i64;
   pub fn new_id() -> String;                       // UUID v7
   /// Come axum::extract::Query, ma ogni rifiuto diventa 422 `validation`.
   pub struct ApiQuery<T>(pub T);
   /// limit 1..=200 (predefinito 50), offset >= 0; fuori intervallo → 422 `validation`.
   #[derive(Deserialize)] pub struct Page { pub limit: Option<i64>, pub offset: Option<i64> }
   impl Page { pub fn resolve(&self) -> ApiResult<(i64, i64)>; }
   /// Controlla le cifre di controllo. Restituisce l'ISBN senza spazi né trattini, in maiuscolo.
   pub fn normalize_isbn13(raw: &str) -> Option<String>;
   pub fn normalize_isbn10(raw: &str) -> Option<String>;
   ```

4. **Aiuti per i test** in `crates/bookeeper-core/tests/common/mod.rs` (aggiungi, senza cambiare ciò che c'è):

   ```rust
   /// Inserisce un libro con SQL diretto (non aggiorna l'indice full-text). Restituisce l'id.
   pub async fn insert_book(state: &AppState, library_id: &str, title: &str) -> String;
   /// Inserisce uno scaffale con SQL diretto, con il prossimo label_code libero. Restituisce l'id.
   pub async fn insert_shelf(state: &AppState, library_id: &str, name: &str, rows: i64, slots_per_row: i64) -> String;
   /// Una seconda libreria con un proprietario e un dispositivo: (library_id, Session).
   pub async fn other_library(state: &AppState) -> (String, Session);
   /// Righe di audit_log come (action, entity_type, entity_id), dalla più vecchia.
   pub async fn audit_rows(state: &AppState, library_id: &str) -> Vec<(String, String, String)>;
   ```

## Test (`crates/bookeeper-core/tests/skeleton_b.rs`)

- `audit_record_writes_who_what_and_when`: dopo `record`, la riga ha libreria, utente, dispositivo, azione, entità, `detail_json` e `at` giusti.
- `audit_record_inside_a_rolled_back_transaction_leaves_nothing`.
- `api_query_rejections_are_validation`: una rotta di prova con `ApiQuery<Page>` e `?limit=abc` → 422 `validation`, JSON.
- `page_defaults_and_bounds`: assente → `(50, 0)`; `limit=200` va; `limit=0`, `limit=201`, `offset=-1` → 422.
- `isbn13_checksum`: `978-0-306-40615-7` → `9780306406157`; con l'ultima cifra cambiata → `None`; 12 cifre → `None`.
- `isbn10_checksum`: `0-306-40615-2` → `0306406152`; `080442957X` valido; `080442957x` normalizzato in maiuscolo; cifra errata → `None`.
- `new_id_is_a_uuid_v7_and_sortable`: due id consecutivi sono diversi e il secondo non è minore del primo.
- `helpers_work`: `insert_book`, `insert_shelf` (due scaffali hanno `label_code` 1 e 2), `other_library`, `audit_rows`.
- `empty_modules_are_mounted`: `GET /api/v1/books` risponde ancora 404 `not_found` JSON (nessuna rotta finché le task non le aggiungono) e `bookeeper_core::openapi()` si costruisce.

## Acceptance criteria

- `cargo test -p bookeeper-core --test skeleton_b` passa con i nove test.
- `cargo test -p bookeeper-core --test devices_api --test openapi` passa ancora.
- I sei moduli vuoti, `audit.rs` e `api/util.rs` esistono.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
