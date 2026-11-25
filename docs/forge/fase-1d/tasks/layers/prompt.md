Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Strati comuni applicati dopo l'unione dei router

## Obiettivo

Chiudere un rimando della fase 0: il server unisce il router del core e quello dell'app web, e gli strati comuni DEVONO valere per entrambi. Oggi non c'è alcuno strato comune. Qui si aggiungono le intestazioni di sicurezza e il tracciamento delle richieste, applicati una volta sola, dopo l'unione.

## Cosa fare

1. `crates/bookeeper-server/src/layers.rs` (nuovo): `pub fn apply(router: axum::Router, info: &ServerInfo) -> axum::Router`.
   - Su **ogni** risposta, se l'intestazione non è già presente: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
   - Sulle risposte sotto `/api/` senza `Cache-Control`: `Cache-Control: no-store`. Una risposta che imposta già `Cache-Control` (o `ETag`) resta com'è: le copertine hanno le loro regole.
   - `Strict-Transport-Security: max-age=31536000` solo se `info.tls` è `Acme`, oppure se `info.public_url` inizia con `https://` e `info.tls` è `Off`. Mai con `SelfSigned` o `Local`.
   - Tracciamento con `tower_http::trace::TraceLayer`: una riga per richiesta con metodo, **solo il percorso** (mai la stringa di query: può contenere codici), stato e durata. Mai intestazioni, mai corpi.
2. `crates/bookeeper-server/src/lib.rs`: `router_for` applica `layers::apply` dopo `merge(web_routes())`. Serve `ServerInfo`: è in `state.server`.
3. Il desktop non usa questi strati: non toccarlo.

## Test

`crates/bookeeper-server/tests/layers.rs`, con server reale su `127.0.0.1:0` (come `tests/serve.rs`):

- `api_and_web_responses_carry_the_security_headers`: `GET /api/v1/health`, `GET /` e `GET /api/v1/non-esiste` hanno tutte e tre le intestazioni.
- `api_responses_are_not_cached`: `GET /api/v1/health` ha `Cache-Control: no-store`; `GET /` non ha `no-store`.
- `a_handler_cache_policy_is_kept`: crea libreria, libro e copertina; `GET /books/{id}/cover` mantiene il `Cache-Control` e l'`ETag` che il core imposta (se oggi il core non imposta `Cache-Control` sulla copertina ma solo `ETag`, verifica che non compaia `no-store`).
- `hsts_follows_the_tls_mode`: assente con `off` senza indirizzo pubblico; presente con `off` più `--public-url https://…`; assente con `self`. Costruisci il router con `build_with_state` su stati con `with_server(...)`: non serve un vero TLS.
- `the_json_404_under_api_is_unchanged`: stesso corpo `{error_code, message}` di prima.

## Acceptance criteria

- `cargo test -p bookeeper-server` passa, test nuovi e vecchi.
- `cargo clippy -p bookeeper-server --all-targets -- -D warnings` è pulito.
- `grep -n "query" crates/bookeeper-server/src/layers.rs` non mostra la stringa di query nei campi tracciati.
- Cambiano solo: `crates/bookeeper-server/src/layers.rs`, `crates/bookeeper-server/src/lib.rs`, `crates/bookeeper-server/tests/layers.rs`.
