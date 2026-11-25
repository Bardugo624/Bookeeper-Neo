Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Rotta pubblica con le informazioni di connessione

## Obiettivo

I client devono sapere come è raggiungibile il server, prima ancora di autenticarsi: il desktop mostra "Aggiungi telefono" solo se il telefono può davvero collegarsi (design §6.4, D7). Il dato esiste già nello stato (`AppState::server`, da `plumbing-d`): qui lo si espone.

## Cosa fare

1. `crates/bookeeper-core/src/api/server.rs` (nuovo): `GET /api/v1/server`, pubblica come `health`.

   ```rust
   #[derive(Serialize, ToSchema)]
   pub struct ServerOut {
       pub version: String,
       pub tls: TlsMode,                 // "local" | "off" | "self" | "acme"
       pub public_url: Option<String>,   // sempre presente nel JSON, null se assente
       pub phone_ready: bool,
   }
   ```

   Annotazione `utoipa` con etichetta `system`, risposta 200. Nessun accesso al database.
2. `api/mod.rs`: dichiara il modulo e monta la rotta.
3. `openapi.rs`: registra la rotta e gli schemi `ServerOut` e `TlsMode`.
4. Non rigenerare `packages/api/openapi.json`: lo fa `api-client-d`.

La rotta non rivela altro: niente nomi di librerie, niente conteggi, niente percorsi su disco.

## Test

`crates/bookeeper-core/tests/server_api.rs`:

- `local_core_reports_local_and_no_phone`: stato di prova → 200, `tls == "local"`, `public_url` è `null` (la chiave esiste), `phone_ready == false`, `version` uguale a `bookeeper_core::VERSION`.
- `acme_server_is_phone_ready`: stato con `with_server(ServerInfo { tls: TlsMode::Acme, public_url: Some("https://libri.example.org".into()) })` → `phone_ready == true`, `public_url` come dato.
- `off_behind_an_https_proxy_is_phone_ready`.
- `self_signed_is_never_phone_ready`: `SelfSigned` con indirizzo `https://…` → `false`.
- `needs_no_token`: nessuna intestazione `Authorization` → 200.
- `is_in_the_openapi_document`: `bookeeper_core::openapi()` contiene il percorso `/api/v1/server` e lo schema `ServerOut`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test server_api --test skeleton --test health` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
- Cambiano solo: `api/server.rs`, `api/mod.rs`, `openapi.rs`, `tests/server_api.rs` (tutti sotto `crates/bookeeper-core/`).
