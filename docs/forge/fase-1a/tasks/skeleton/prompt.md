Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Scheletro: moduli vuoti, errori, estrattore JSON, OpenAPI per modulo

## Obiettivo

Creare tutti i file che le task successive riempiranno, così ognuna tocca solo i propri. Dopo questa task nessuno modifica più `lib.rs`, `api/mod.rs`, `auth/mod.rs`, `openapi.rs`.

## Cosa fare

1. **`crates/bookeeper-core/src/auth/mod.rs`**: definisce `Role`, `DeviceKind`, `Identity`, `Session` e le tre costanti esattamente come nel contratto, e dichiara `pub mod password; pub mod tokens; pub mod sessions; pub mod guard; pub mod limit;`. Crea i cinque file con il solo commento di modulo. `Role` e `DeviceKind` derivano `Serialize`, `Deserialize`, `ToSchema` in minuscolo.

2. **Moduli delle rotte**: `api/setup.rs`, `api/auth.rs`, `api/pairing.rs`, `api/devices.rs`. Ognuno contiene, per ora:

   ```rust
   pub fn routes() -> axum::Router<crate::AppState> { axum::Router::new() }

   #[derive(utoipa::OpenApi)]
   #[openapi()]
   pub struct Doc;
   ```

   `api/mod.rs` unisce i quattro `routes()` nel router. `openapi.rs` unisce i quattro `Doc` nella specifica (`merge`). Le task successive aggiungono rotte e schemi solo nel proprio modulo.

3. **Errori** in `error.rs`: costruttori `ApiError::validation(msg)` (422, `validation`), `ApiError::too_many_requests(retry_after_secs: u64)` (429, `rate_limited`, intestazione `Retry-After`), `ApiError::coded(status, code, msg)` per gli altri codici del contratto. `conflict` resta. Il corpo JSON non cambia forma.

4. **`ApiJson<T>`** in `src/extract.rs`, riesportato da `lib.rs`: estrattore che avvolge `axum::Json<T>` e trasforma ogni rifiuto in `ApiError`: JSON malformato, tipo di contenuto errato o corpo mancante → 400 `bad_request`; JSON valido ma con campi mancanti o di tipo sbagliato → 422 `validation`.

5. **Istantanea OpenAPI**: da qui alla task `api-client` l'istantanea `packages/api/openapi.json` resta indietro. Marca `committed_snapshot_is_current` in `tests/openapi.rs` con `#[ignore = "run by the openapi CI job and by the api-client task"]`. In `.github/workflows/ci.yml`, job `openapi`, il passo diventa `cargo test -p bookeeper-core --test openapi -- --include-ignored`. Non rigenerare l'istantanea.

## Test (`crates/bookeeper-core/tests/skeleton.rs`)

Con un router di prova che ha una rotta `POST /echo` con `ApiJson<Body { name: String }>`:

- `malformed_json_is_bad_request`: corpo `{` → 400, `error_code: bad_request`, `content-type: application/json`.
- `wrong_content_type_is_bad_request`: `text/plain` → 400 `bad_request`.
- `missing_field_is_validation`: `{}` → 422 `validation`.
- `too_many_requests_sets_retry_after`: la risposta di `ApiError::too_many_requests(30)` ha stato 429 e `Retry-After: 30`.
- `role_ordering`: `Owner.at_least(Admin)`, `Member.at_least(Member)`, `!Guest.at_least(Member)`; `"admin".parse::<Role>()` funziona e `"boss"` no.
- `role_and_kind_serialize_lowercase`: `serde_json::to_string(&Role::Owner) == "\"owner\""`, lo stesso per `DeviceKind::Mobile`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test skeleton` passa con i sei test.
- `cargo test -p bookeeper-core --test openapi` passa e riporta un test ignorato.
- `cargo test -p bookeeper-core --test health --test errors` passa ancora.
- I nove file nuovi sotto `src/auth/` e `src/api/` esistono.
- `ci.yml` usa `--include-ignored` nel job `openapi`; gli altri job sono invariati.
- `packages/api/openapi.json` non è stato modificato.
