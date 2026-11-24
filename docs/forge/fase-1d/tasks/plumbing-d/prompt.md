Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Fondamenta 1D: stato del core e crate di rete

## Obiettivo

Preparare ciò che le task del core e della rete usano senza poterlo modificare: una dipendenza del core, il tipo `ServerInfo` nello stato, lo scheletro del crate `bookeeper-net`. Alla fine tutto compila e i test esistenti passano.

## Cosa fare

1. **Core** (`crates/bookeeper-core`).
   - `Cargo.toml`: `http-body-util` diventa dipendenza normale (oggi è solo di sviluppo); `futures-util` tra quelle di sviluppo.
   - `state.rs`: `TlsMode`, `ServerInfo`, il campo `AppState::server` e `AppState::with_server`, come da contratto. `open`, `open_with_data` e `for_tests` usano `ServerInfo::local()`.
   - `lib.rs`: riesporta `ServerInfo` e `TlsMode`.
   - Nessuna rotta nuova: `GET /server` arriva con la task `server-info`.

2. **Crate nuovo `crates/bookeeper-net`** (libreria, `publish = false`, versione ed edizione dal workspace; il workspace lo include già con `crates/*`).
   - `src/lib.rs`: `NetError` (con `thiserror`, varianti del contratto), `install_crypto_provider()` (installa il fornitore `ring` di `rustls` come predefinito del processo; chiamarla più volte non è un errore e non fa `panic`), `pub mod tls; pub mod phrase; pub mod mdns;`.
   - `src/tls.rs`, `src/phrase.rs`, `src/mdns.rs`: solo un commento di modulo di una riga. Nessuna firma provvisoria, nessun `todo!()`.
   - Dipendenze: `rustls` (senza funzioni predefinite; con `ring`, `std`, `tls12`, `logging`), `rcgen`, `sha2`, `hex`, `mdns-sd`, `thiserror`, `tracing`, `tokio` (`time`, `rt`). Sviluppo: `tokio` (`macros`, `rt-multi-thread`, `net`, `io-util`, `time`), `tokio-rustls` (senza funzioni predefinite, con `ring`), `tempfile`. Scegli le versioni più recenti compatibili tra loro e con la `rustls` che `reqwest` porta già nel workspace: una sola versione di `rustls` nell'albero.
   - `rcgen` DEVE usare `ring`, non `aws-lc-rs`: controlla le sue funzioni predefinite e disattivale se serve.

## Test

- `crates/bookeeper-core/tests/plumbing_d.rs`:
  - `the_local_core_is_not_phone_ready`: `ServerInfo::local()` → `tls == TlsMode::Local`, `public_url == None`, `phone_ready() == false`.
  - `phone_ready_needs_https_and_a_real_certificate`: `Acme` con `https://…` → vero; `Off` con `https://…` → vero; `Off` con `http://…` → falso; `Off` senza indirizzo → falso; `SelfSigned` con `https://…` → falso.
  - `tls_mode_serializes_to_the_contract_names`: `"local"`, `"off"`, `"self"`, `"acme"`.
  - `with_server_replaces_the_value`: su uno stato di prova.
- `crates/bookeeper-net/tests/provider.rs`:
  - `installing_the_provider_twice_is_fine`: due chiamate, poi `rustls::crypto::CryptoProvider::get_default()` è presente.

## Acceptance criteria

- `cargo build --workspace --all-targets` passa.
- `cargo test -p bookeeper-core -p bookeeper-net` passa.
- `cargo clippy --workspace --all-targets -- -D warnings` è pulito.
- `cargo tree -i aws-lc-rs`, `cargo tree -i aws-lc-sys`, `cargo tree -i openssl-sys` non trovano alcun pacchetto.
- `cargo tree -p bookeeper-net -i rustls` mostra una sola versione di `rustls`.
- `apps/desktop/src-tauri` compila senza modifiche.
- Cambiano solo: `Cargo.lock`, `crates/bookeeper-core/Cargo.toml`, `crates/bookeeper-core/src/state.rs`, `crates/bookeeper-core/src/lib.rs`, `crates/bookeeper-core/tests/plumbing_d.rs`, file sotto `crates/bookeeper-net/`.
