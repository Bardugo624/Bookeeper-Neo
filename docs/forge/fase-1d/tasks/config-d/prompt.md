Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Fondamenta 1D: configurazione completa del server

## Obiettivo

Dare a `bookeeper-server` tutta la configurazione della tabella del contratto e le dipendenze che le task successive useranno. Il TLS vero, l'annuncio mDNS e gli strati arrivano dopo: qui si prepara il terreno. Alla fine tutto compila e i test esistenti passano.

## Cosa fare

1. **`crates/bookeeper-server/Cargo.toml`**: aggiungi `bookeeper-net` (percorso), `rustls` (senza funzioni predefinite; `ring`, `std`, `tls12`, `logging`), `axum-server` (funzione `tls-rustls-no-provider`), `rustls-acme` (senza funzioni predefinite; `axum`, `ring`, e ciò che serve per le radici CA senza `aws-lc-rs`), `tower-http` (`trace`, `set-header`), `tower`, `gethostname`. Sviluppo: a `reqwest` aggiungi `rustls-tls`. Scegli le versioni più recenti compatibili con `axum 0.8`, con la `rustls` già nel workspace e tra loro. Se una combinazione non esiste senza `aws-lc-rs`, fermati e dillo con l'uscita di `cargo tree`.
2. **`src/config.rs`** (nuovo): sposta qui `Config`, `Cli`, `Command` da `lib.rs` e completa `Config` come da tabella del contratto.
   - `TlsChoice { Off, SelfSigned, Acme }` (valori da riga di comando `off`, `self`, `acme`) e `Switch { On, Off }` sono `clap::ValueEnum`.
   - `port` diventa `Option<u16>`; `listen_port()` applica il predefinito.
   - `lib.rs` riesporta tutto: `bookeeper_server::{Config, Cli, Command, TlsChoice, Switch}`.
3. **`Config::validate`**. Errori, con messaggio in italiano che nomina il flag, come `StartError::Config(String)` (variante nuova):
   - `acme` senza `--domain`;
   - `--domain` che non è un nome DNS (etichette di lettere, cifre e `-`, separate da `.`; niente schema, porta, percorso, spazi);
   - `--public-url` che non inizia con `http://` o `https://`, o che ha solo lo schema.
4. **`Config::public_url`**: il valore esplicito vince, senza barre finali; con `acme` e nessun valore esplicito è `https://<dominio>`, più `:<porta>` se la porta non è 443; negli altri casi `None`.
5. **`Config::server_info`**: `tls` dalla modalità (`Off`, `SelfSigned`, `Acme`; mai `Local`), `public_url` da `public_url()`.
6. **`lib.rs` e `main.rs`**: `app_state(db, &Config)` costruisce lo stato con `with_server(cfg.server_info())`; `bind` usa `listen_port()`; `build` e `build_with_data` si adattano. `main.rs` chiama `validate()` prima di aprire porta, cartella o database. Il sottocomando `setup-code` resta com'è.
7. Con `--tls self` o `--tls acme` il server per ora parte in chiaro come con `off`: il TLS arriva con la task `tls-serve`. Non scrivere alcun test su questo comportamento.
8. **Test esistenti** in `crates/bookeeper-server/tests`: costruiscono `Config` campo per campo. Adattali con `Config::for_data_dir(dir)` più l'assegnazione dei campi che servono. Non cambiare ciò che verificano.

## Test nuovi

`crates/bookeeper-server/tests/config.rs`:

- `default_port_depends_on_the_tls_mode`: 7842 con `off` e `self`; 443 con `acme`; `--port` esplicito vince sempre.
- `acme_needs_a_domain`, `a_domain_must_be_a_dns_name` (`https://x.org`, `x.org:443`, `x.org/a`, `con spazio` rifiutati; `libri.example.org` accettato), `public_url_must_be_http_or_https`.
- `public_url_is_explicit_or_derived`: esplicito con barra finale → senza; `acme` su 443 → `https://dominio`; `acme` su 8443 → `https://dominio:8443`; `off` senza valore → `None`.
- `server_info_reflects_the_configuration`: `phone_ready()` vero con `acme`; vero con `off` più `--public-url https://…`; falso con `self` anche con indirizzo `https://`.
- `flags_and_environment_are_read`: `Cli::try_parse_from` con `--tls self --mdns off --bind 127.0.0.1`; un valore sconosciuto per `--tls` è un errore di `clap`.
- `an_invalid_configuration_touches_nothing`: esegui il binario con `--tls acme --data-dir <cartella inesistente>`: codice d'uscita diverso da 0, stderr nomina `--domain`, la cartella non viene creata.

## Acceptance criteria

- `cargo build --workspace --all-targets` passa.
- `cargo test -p bookeeper-server` passa, test nuovi e vecchi.
- `cargo clippy --workspace --all-targets -- -D warnings` è pulito.
- `cargo tree -i aws-lc-rs`, `cargo tree -i aws-lc-sys`, `cargo tree -i openssl-sys` non trovano alcun pacchetto.
- `cargo run -p bookeeper-server -- --help` elenca tutti i flag della tabella del contratto.
- Cambiano solo: `Cargo.lock`, `crates/bookeeper-server/Cargo.toml`, `crates/bookeeper-server/src/config.rs`, `src/lib.rs`, `src/main.rs`, file sotto `crates/bookeeper-server/tests/`.
