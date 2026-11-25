Leggi prima `docs/forge/fase-2d/CONTRATTO.md` e i contratti che cita: regole, nomi e aspetto valgono anche qui. La task `keychain` è già unita.

# Guscio: condivisione in rete

Segui la sezione "Condivisione in rete" del contratto e il design §6.4 (Trasporto). Leggi `apps/desktop/src-tauri/src/lib.rs`, `crates/bookeeper-server/src/{tls,announce,lib}.rs` (come il server autonomo serve TLS e si annuncia: stesso comportamento, non lo stesso codice) e `crates/bookeeper-net`.

## Cosa fare

1. **`sharing.rs`**: un gestore con stato (`Mutex`) che possiede il compito del server, l'annuncio mDNS e la preferenza. `start`: controlla la password del proprietario; carica o crea l'identità in `<dati>/tls/self/` con i nomi `localhost`, nome host e indirizzi IPv4 privati; apre `0.0.0.0:<porta>`; serve il router del core con `axum-server` e `rustls` (`ring`, dopo `bookeeper_net::install_crypto_provider()`); annuncia. `stop`: arresto ordinato entro 10 secondi e ritiro dell'annuncio. Chiudere l'app ferma la condivisione.
2. **Router condiviso**: lo stesso `AppState` dell'app, con `ServerInfo { tls: SelfSigned, public_url: None }` per le richieste che arrivano dalla rete (così `GET /server` dice `phone_ready: false`), senza cambiare ciò che vede l'app in processo. Applica alle richieste di rete gli stessi strati di sicurezza del server autonomo che sono disponibili senza dipendere da `bookeeper-server` (intestazioni di sicurezza, nessuna cache sulle API): riscrivili qui in piccolo, non aggiungere quel crate come dipendenza.
3. **Politica di setup**: una richiesta dalla rete NON può creare una libreria (`POST /setup` risponde come un server già configurato). Leggi `SetupPolicy` nel core e scegli la variante che lo garantisce per il router di rete.
4. **Comandi** `sharing_status` e `sharing_set`; preferenza in `sharing.json` (scrittura atomica); riavvio automatico all'apertura dell'app se `enabled`.
5. **Indirizzi**: elenco degli IPv4 privati delle interfacce attive, senza loopback. Se servisse un crate per elencarle, sceglilo piccolo e senza dipendenze di sistema; in alternativa il trucco del socket UDP "connesso" per l'indirizzo principale.

## Test

In `apps/desktop/src-tauri/tests/sharing.rs`, su `127.0.0.1:0` (il gestore accetta un indirizzo d'ascolto iniettabile nei test) e con mDNS disattivabile:

- `sharing_serves_the_core_over_pinned_tls`: `GET /api/v1/health` con `pinned_client_config` dell'impronta riportata dà 200.
- `status_reports_fingerprint_and_phrase`: uguali a quelle dell'identità.
- `plain_http_is_refused`.
- `without_a_password_sharing_does_not_start`: `password_required`, nessuna porta aperta.
- `a_busy_port_is_reported`: `port_in_use`.
- `stopping_closes_the_port` entro il tempo previsto.
- `the_preference_survives_a_restart` e `sharing_restarts_when_enabled`.
- `network_requests_cannot_create_a_library`.
- `server_info_over_the_network_says_self` e in processo resta `local`.
- `pairing_works_over_the_network`: codice generato in processo, riscattato dalla rete, `GET /me` dalla rete dà 200.
- `identity_is_stable_across_restarts`.
- Annuncio reale: `#[ignore]`.

## Acceptance criteria

- `cargo test -p bookeeper-desktop`, `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` passano.
- `cargo tree -i aws-lc-rs`, `-i aws-lc-sys`, `-i openssl-sys` non trovano nulla.
- Cambiano solo: `apps/desktop/src-tauri/src/lib.rs`, `sharing.rs`, `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock`, file sotto `apps/desktop/src-tauri/tests/`.
