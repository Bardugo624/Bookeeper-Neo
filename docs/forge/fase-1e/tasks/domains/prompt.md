Leggi prima `docs/forge/fase-1e/CONTRATTO.md` e i quattro contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Server: più domini, indirizzo pubblico valido, limite all'handshake

## Obiettivo

Il proprietario pubblica il server su due nomi, `mobile.neokeeper.dev` e `app.neokeeper.dev`. Oggi `--domain` accetta un solo nome. In più, due difetti P3 del run 1D toccano gli stessi file.

Leggi `crates/bookeeper-server/src/config.rs`, `crates/bookeeper-server/src/tls.rs` e `crates/bookeeper-server/src/main.rs` prima di scrivere.

## 1. Più domini

Segui la sezione "Configurazione del server: domini" del contratto.

- `Config.domain: Option<String>` diventa `Config.domains: Vec<String>`. Con `clap`: flag ripetibile, `value_delimiter = ','`, stessa variabile `BOOKEEPER_DOMAIN`.
- Normalizzazione in un solo punto (`Config::domain_names(&self) -> Vec<String>`, pubblico): spazi attorno tolti, minuscolo, voci vuote scartate, doppioni scartati, ordine conservato. Tutto il resto del codice usa questo metodo, non il campo.
- `validate`: con `acme` serve almeno un nome (messaggio attuale, invariato). Ogni nome DEVE superare `is_dns_name`; il messaggio d'errore cita il nome sbagliato.
- `public_url`: con `acme` e senza `--public-url`, usa il primo nome.
- `tls.rs`, `TlsServer::acme`: `AcmeConfig` riceve tutti i nomi. Un solo certificato.
- `tls.rs`, `self_names`: include tutti i nomi.
- `main.rs`: la riga `Certificato richiesto per …` elenca tutti i nomi separati da `, `.
- `Config::for_data_dir`: `domains` vuoto.
- Adatta i test esistenti che scrivono `c.domain = Some(…)` (`tests/config.rs`, `tests/tls.rs`, `tests/announce.rs`): solo il minimo per farli compilare con il campo nuovo.

## 2. `--public-url` controllato davvero (difetto P3)

Oggi `validate` accetta `https:// x` (con uno spazio) e `http:///x` (host vuoto). Regola: dopo `http://` o `https://` DEVE esserci un host non vuoto, fatto di un nome DNS valido, oppure di un indirizzo IPv4, oppure di un IPv6 tra parentesi quadre; poi una porta facoltativa `:1..=65535`; poi un percorso facoltativo che inizia con `/`. Nessuno spazio, nessun carattere di controllo, nessuna parte `utente@`, nessuna query e nessun frammento. Il messaggio d'errore attuale resta.

## 3. Limite di tempo all'handshake in `acme` (difetto P3)

Oggi in `acme` un client che apre la connessione e non manda il ClientHello tiene occupati un compito e un descrittore di file senza limite. In `self` il limite è 10 secondi (`RustlsAcceptor` di `axum-server`).

Regola: in `acme` l'handshake TLS DEVE concludersi entro 10 secondi, altrimenti la connessione è chiusa. Avvolgi l'accettore ACME in un accettore che applica `tokio::time::timeout`. Costante `HANDSHAKE_TIMEOUT`. Nessuna dipendenza nuova.

## Test

`crates/bookeeper-server/tests/config.rs`:

- `domains_come_from_repeated_flags_and_commas`: `--domain a.example.org --domain B.example.org,c.example.org` dà `["a.example.org", "b.example.org", "c.example.org"]`.
- `domains_come_from_the_environment`: `BOOKEEPER_DOMAIN=a.example.org, b.example.org` dà i due nomi (prova con `Cli::try_parse_from` e la variabile impostata sul processo figlio, oppure con il binario: non modificare l'ambiente del processo di test).
- `duplicate_domains_are_dropped`.
- `every_domain_must_be_a_dns_name`: con `a.example.org,non valido` l'errore cita `non valido`.
- `the_first_domain_is_the_public_address`: con `acme` e due nomi, `public_url()` è `https://<primo>`.
- `public_url_rejects_malformed_addresses`: `https:// x`, `http:///x`, `https://`, `https://a b.example.org`, `https://utente@example.org`, `https://example.org:0`, `https://example.org:70000`, `https://example.org/?q=1`, `ftp://example.org` sono rifiutati.
- `public_url_accepts_valid_addresses`: `https://libri.example.org`, `https://libri.example.org:8443`, `http://192.168.1.10:7842`, `https://[::1]:7842`, `https://libri.example.org/base/` sono accettati.

`crates/bookeeper-server/tests/tls.rs`:

- `self_names_include_every_domain`.
- `acme_mode_starts_with_two_domains`: come il test esistente `acme_mode_starts_and_listens_without_a_certificate`, con due nomi. Nessuna connessione a Internet: usa una directory ACME su `127.0.0.1` come fa quel test.
- `acme_mode_drops_a_silent_connection`: apri una connessione TCP al server in `acme`, non scrivere nulla; entro 15 secondi la lettura termina (fine del flusso o errore).

## Acceptance criteria

- `cargo test -p bookeeper-server --test config` passa.
- `cargo test -p bookeeper-server --test tls` passa.
- `cargo build -p bookeeper-server --all-targets` passa.
- `cargo clippy -p bookeeper-server --all-targets -- -D warnings` passa.
- `cargo tree -i aws-lc-rs`, `cargo tree -i aws-lc-sys` e `cargo tree -i openssl-sys` non trovano nulla.
- Cambiano solo: `crates/bookeeper-server/src/config.rs`, `crates/bookeeper-server/src/tls.rs`, `crates/bookeeper-server/src/main.rs`, `crates/bookeeper-server/tests/config.rs`, `crates/bookeeper-server/tests/tls.rs`, `crates/bookeeper-server/tests/announce.rs`.
