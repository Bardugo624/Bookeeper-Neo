Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Scheletro delle rotte del run 1C

## Obiettivo

Creare i moduli vuoti delle rotte, così le task successive toccano solo il proprio file. Dopo questa task nessuno modifica `api/mod.rs` né `openapi.rs`.

## Cosa fare

1. Moduli vuoti con lo schema di `api/devices.rs` (`pub fn routes() -> axum::Router<AppState>` vuoto e `pub struct Doc` con `#[openapi()]`): `api/lookup.rs`, `api/covers.rs`, `api/transfer.rs`, `api/confirm.rs`, `api/backup.rs`, `api/labels.rs`.
2. Uniscili in `api/mod.rs` e in `openapi.rs`, dopo quelli esistenti.
3. In `api/util.rs` aggiungi ciò che più task useranno per rispondere con un file:

   ```rust
   /// Risposta 200 con i byte, il Content-Type dato e `Content-Disposition: attachment; filename="<nome>"`.
   /// Il nome è ridotto a lettere ASCII, cifre, `-`, `_` e `.`; ogni altro carattere diventa `_`.
   pub fn download(bytes: Vec<u8>, content_type: &'static str, filename: &str) -> axum::response::Response;
   /// Legge l'intero corpo fino a `max_bytes`. Oltre → 413 `payload_too_large`.
   pub async fn read_body(body: axum::body::Body, max_bytes: usize) -> ApiResult<Vec<u8>>;
   ```

## Test (`crates/bookeeper-core/tests/skeleton_c.rs`)

- `download_sets_type_and_disposition`: `Content-Type` e `Content-Disposition` giusti; il corpo è quello dato.
- `download_sanitises_the_filename`: `"Casa mia/../x\".zip"` non produce `/`, `"`, `\` né spazi nell'intestazione.
- `read_body_accepts_up_to_the_limit`: un corpo di esattamente `max_bytes` è letto per intero.
- `read_body_rejects_larger_bodies`: `max_bytes + 1` → 413 `payload_too_large`, JSON.
- `openapi_still_builds_and_keeps_existing_paths`: `bookeeper_core::openapi()` contiene ancora `/api/v1/books` e `/api/v1/health`.
- `existing_routes_still_answer`: `GET /api/v1/health` → 200.

Non scrivere test che affermano un 404 sulle rotte non ancora implementate: diventerebbero falsi alla task successiva.

## Acceptance criteria

- `cargo test -p bookeeper-core --test skeleton_c` passa con i sei test.
- `cargo test -p bookeeper-core --test skeleton_b --test openapi --test books_api` passa ancora.
- I sei moduli vuoti esistono e sono uniti in `api/mod.rs` e `openapi.rs`.
- Cambiano solo `api/mod.rs`, `api/util.rs`, `openapi.rs`, i sei file nuovi e il file di test.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
