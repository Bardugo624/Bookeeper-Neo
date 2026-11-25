# Contratto del run 1C

Valgono le regole, le convenzioni e gli errori di `docs/forge/fase-1a/CONTRATTO.md` e `docs/forge/fase-1b/CONTRATTO.md`. Qui ci sono solo le aggiunte. Dove i file divergono, vince questo.

## Regole aggiunte

- Solo `plumbing-c` modifica `Cargo.toml`, `Cargo.lock`, `state.rs`, `lib.rs`, `lookup/mod.rs` (tipi) e i due eseguibili. Solo `skeleton-c` modifica `api/mod.rs` e `openapi.rs`. Se manca una dipendenza, fermati e dillo.
- **Nessun accesso alla rete nei test.** I parser si provano su file in `crates/bookeeper-core/tests/fixtures/`. Le richieste HTTP si provano contro un server locale avviato dal test su `127.0.0.1:0`.
- Le richieste verso l'esterno usano solo `state.http`.
- I file su disco stanno solo sotto `state.files.covers_dir` e `state.files.backups_dir`. I nomi dei file derivano da identificativi generati dal server, mai da testo dell'utente.
- I/O su disco, decodifica di immagini, compressione e generazione di PDF sono lavoro bloccante: dentro `tokio::task::spawn_blocking` o `db.run`.
- Riferimento per la parità: i file Go della 0.3 sotto `server/internal/` si possono leggere, mai modificare.

## Stato dell'app (da `plumbing-c`)

```rust
pub struct Files { pub covers_dir: PathBuf, pub backups_dir: PathBuf }

AppState {
    …,                                  // campi esistenti
    pub files: Arc<Files>,
    pub http: reqwest::Client,           // timeout 10 s, User-Agent "Bookeeper/<versione>"
    pub allow_private_fetch: bool,       // false in produzione, true in for_tests()
    pub lookup: Arc<lookup::LookupService>,
}
AppState::open(db, policy)                       // resta: cartelle sotto una cartella temporanea unica
AppState::open_with_data(db, policy, data_dir)   // crea <data_dir>/covers e <data_dir>/backups
```

## Lookup (tipi in `bookeeper_core::lookup`, da `plumbing-c`)

```rust
#[derive(Debug, Clone, Default, PartialEq, Serialize, ToSchema)]
pub struct Metadata {
    pub title: Option<String>, pub subtitle: Option<String>, pub authors: Vec<String>,
    pub publisher: Option<String>, pub published_year: Option<i32>, pub page_count: Option<i32>,
    pub language: Option<String>, pub description: Option<String>, pub genre: Option<String>,
    pub isbn_13: Option<String>, pub isbn_10: Option<String>,
    pub cover_candidates: Vec<String>,   // URL https, dal più autorevole
    pub sources: Vec<String>,            // fornitori che hanno dato almeno un campo
}

#[async_trait::async_trait]
pub trait Provider: Send + Sync {
    fn name(&self) -> &'static str;      // "google-books" | "annas-archive" | "open-library"
    /// Ok(None) = nessun risultato. Err = guasto del fornitore (rete, formato inatteso).
    async fn lookup(&self, isbn_13: &str) -> Result<Option<Metadata>, ProviderError>;
}
pub struct ProviderError(pub String);

impl LookupService {
    pub fn new(http: reqwest::Client) -> Self;                       // Google, Anna's, Open Library, in quest'ordine
    pub fn with_providers(providers: Vec<Arc<dyn Provider>>) -> Self; // per i test
    pub async fn lookup(&self, isbn_13: &str, fresh: bool, now: i64) -> Option<Metadata>;
}
```

## Errori aggiunti

| Stato | `error_code` | Quando |
| --- | --- | --- |
| 400 | `unsupported_image` | il file non è JPEG, PNG o WebP valido |
| 400 | `invalid_archive` | archivio di backup illeggibile o di formato sconosciuto |
| 401 | `confirmation_required` | manca o è scaduto il token di conferma |
| 404 | `isbn_not_found` | nessun fornitore conosce l'ISBN |
| 404 | `cover_not_found` | il libro non ha copertina |
| 422 | `cover_fetch_failed` | nessun URL candidato ha dato un'immagine valida |

## Azioni di audit aggiunte

`book.cover` (carica o scarica), `book.cover_delete`, `library.import`, `library.backup`, `library.restore`. Per le tre di libreria: `entity_type: "library"`, `entity_id` = id della libreria.

## Rotte

| Metodo e percorso | Accesso | Corpo | Risposta |
| --- | --- | --- | --- |
| `GET /lookup/isbn/{isbn}?fresh=true` | ogni ruolo | — | 200 `Metadata` |
| `GET /books/{id}/cover` | ogni ruolo | — | 200 `image/jpeg` |
| `PUT /books/{id}/cover` | membro | byte dell'immagine, al più 5 MB | 200 `{cover_color}` |
| `POST /books/{id}/cover/fetch` | membro | `{candidates: [url]}` (1–8) | 200 `{cover_color, source_url}` |
| `DELETE /books/{id}/cover` | membro | — | 204 |
| `POST /import` | admin | `{format, content, dry_run}` | 200 `ImportReport` |
| `GET /export?format=json\|csv` | membro | — | 200 file |
| `POST /auth/confirm` | `AuthUser` | `{password?}` | 200 `{confirm_token, expires_in}` |
| `POST /backup` | admin | — | 200 `application/zip` |
| `POST /restore` | proprietario + token di conferma | archivio zip | 200 `RestoreReport` |
| `GET /backups` | admin | — | 200 `{items: [{name, created_at, size_bytes}]}` |
| `GET /backups/config` · `PUT /backups/config` | admin | `{interval_days, keep}` | 200 `{interval_days, keep}` |
| `POST /labels/pdf` | ogni ruolo | `{book_ids}` (1–2000) | 200 `application/pdf` |

Il token di conferma viaggia nell'intestazione `X-Confirm-Token`.
