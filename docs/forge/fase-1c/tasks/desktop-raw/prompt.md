Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Desktop: trasporto di dati binari attraverso Tauri

## Obiettivo

L'app desktop chiama il core in processo attraverso il comando Tauri `api_request`, che trasporta solo testo. Copertine, PDF, archivi ed export sono byte. Aggiungere un secondo comando e implementare `requestRaw` nel trasporto del desktop. File: `apps/desktop/src-tauri/src/dispatch.rs`, `src-tauri/src/lib.rs`, `apps/desktop/src/transport.ts`, `apps/desktop/src/transport.test.ts`. Leggi prima `dispatch.rs` e `packages/api/src/transport.ts` (`RawRequest`, `RawResponse`).

## Rust

```rust
#[derive(Debug, Serialize)]
pub struct RawApiResponse { pub status: u16, pub body_base64: String, pub content_type: Option<String>, pub headers: std::collections::BTreeMap<String, String> }

pub async fn dispatch_raw(
    router: axum::Router, method: &str, path: &str,
    body_base64: Option<String>, content_type: Option<String>,
    headers: std::collections::BTreeMap<String, String>,
) -> RawApiResponse;
```

- Stesse regole di `dispatch`: solo `GET`, `POST`, `PUT`, `PATCH`, `DELETE`; solo percorsi che iniziano con `/api/`; mai panic. Una richiesta rifiutata risponde 400 con il corpo JSON `bad_request` codificato in base64.
- `body_base64` non valido → 400 `bad_request`.
- Intestazioni in ingresso ammesse: solo `if-none-match` e `x-confirm-token`, senza distinguere maiuscole. Le altre sono ignorate: il webview non deve poter impostare `Authorization` né `Host`.
- Intestazioni in uscita restituite: `etag`, `content-disposition`, `x-labels-skipped`, `retry-after`, `cache-control`, in minuscolo.
- Comando Tauri `api_request_raw` con gli stessi argomenti, registrato accanto ad `api_request`.

`base64` è già tra le dipendenze transitive: se non è utilizzabile direttamente dal crate `bookeeper-desktop`, aggiungilo a `apps/desktop/src-tauri/Cargo.toml` (è l'unica modifica ammessa ai manifest, con `Cargo.lock`).

## TypeScript

`createTauriTransport()` guadagna `requestRaw`: codifica `body` in base64, chiama `invoke('api_request_raw', …)`, decodifica `body_base64` in `Uint8Array`. Un `invoke` che fallisce → `ApiError(0, 'network', …)`, come per `request`. `request` accetta il quarto argomento `headers` e lo inoltra, se il tipo `Transport` lo prevede.

La codifica base64 deve reggere file di molti megabyte senza `String.fromCharCode(...bytes)` su tutto l'array (supera il limite degli argomenti): lavora a blocchi.

## Test

Rust, in `dispatch.rs`:
- `raw_get_returns_bytes_and_content_type`: `GET /api/v1/health` → 200, `content_type` `application/json`, corpo decodificato con `"status":"ok"`.
- `raw_rejects_paths_outside_api_and_bad_methods`: 400, corpo JSON `bad_request` in base64.
- `raw_rejects_invalid_base64`.
- `raw_forwards_only_allowed_headers`: con un router di prova che restituisce le intestazioni ricevute, `x-confirm-token` e `If-None-Match` arrivano; `authorization` e `host` no.
- `raw_returns_selected_response_headers`: un router di prova che imposta `ETag`, `Content-Disposition` e `Set-Cookie`: i primi due tornano, in minuscolo; `set-cookie` no.
- `raw_round_trips_binary_bodies`: 256 byte da 0 a 255 inviati a una rotta di prova che li rimanda uguali.

TypeScript, in `transport.test.ts`, con `invoke` finto:
- `requestRaw` invia `body_base64` giusto per `Uint8Array [0, 255, 128]` e decodifica la risposta negli stessi byte;
- regge un corpo di 2 MB senza eccezioni;
- senza corpo invia `body_base64: null`;
- un `invoke` rifiutato diventa `ApiError` con `code === 'network'`;
- i tre test esistenti restano e passano.

## Acceptance criteria

- `cargo test -p bookeeper-desktop` passa, con i test nuovi e gli otto vecchi.
- `npm test -w @bookeeper/desktop` e `npm run typecheck -w @bookeeper/desktop` passano.
- `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` è pulito.
- Cambiano solo i quattro file indicati e, se serve, `apps/desktop/src-tauri/Cargo.toml` e `Cargo.lock`.
