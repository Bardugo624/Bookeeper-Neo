Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Server: modalità TLS `self` e `acme`

## Obiettivo

`bookeeper-server --tls self` serve HTTPS con il certificato autogenerato e mostra impronta e frase di verifica. `--tls acme --domain <nome>` ottiene e rinnova da solo un certificato Let's Encrypt. `--tls off` resta com'è (design §6.4). La configurazione esiste già (`config.rs`, da `config-d`); l'identità autogenerata pure (`bookeeper_net::tls`, da `net-tls`).

## Cosa fare

1. **`src/tls.rs`** (nuovo, nel crate del server).
   - `self`: `Identity::load_or_create(<dati>/tls/self, nomi)`. Nomi: `localhost`, il nome della macchina (`gethostname`), `--domain` se dato, e l'indirizzo di `--bind` se non è `0.0.0.0` o `::`.
   - `acme`: `rustls-acme` con sfida TLS-ALPN-01, dominio da `--domain`, contatto `mailto:` da `--acme-email` se dato, cache in `<dati>/tls/acme`, directory da `--acme-directory` (assente → Let's Encrypt produzione). Il ciclo degli eventi ACME gira in un compito in background: successi a livello `info`, errori a livello `warn`, mai `panic`, mai uscita dal processo. Finché il certificato non c'è, il server resta in ascolto.
   - Servizio con `axum-server` sul socket **già aperto** da `bind` (l'ordine di oggi resta: prima la porta, poi la cartella dati). Chiusura ordinata su Ctrl+C e SIGTERM come in chiaro, con un limite di 10 secondi.
   - `bookeeper_net::install_crypto_provider()` prima di ogni uso di `rustls`.
2. **`src/lib.rs`**: `serve` sceglie in base alla modalità. Esponi ciò che serve ai test per avviare il server in `self` su `127.0.0.1:0` e conoscerne l'impronta.
3. **`src/main.rs`**: righe d'avvio come da contratto (schema `https` con `self` e `acme`; impronta e frase solo con `self`). Con `acme` stampa anche `Certificato richiesto per <dominio>: la porta 443 deve essere raggiungibile da Internet.`
4. **Sottocomando `fingerprint`** (`src/config.rs`, `src/main.rs`): legge `<dati>/tls/self` senza aprire porte né database e stampa le due righe `Impronta del certificato:` e `Frase di verifica:`. Se l'identità non esiste: messaggio in italiano che dice di avviare una volta con `--tls self`, codice d'uscita 1. Non la crea.
5. Puoi modificare `crates/bookeeper-server/Cargo.toml` e `Cargo.lock` se una dipendenza scelta dalle task di fondamenta non basta. Dichiaralo nel rapporto.

## Test

`crates/bookeeper-server/tests/tls.rs` (nessun accesso a Internet):

- `self_mode_serves_https_with_the_pinned_identity`: server in `self` su `127.0.0.1:0`; `reqwest` costruito con `use_preconfigured_tls(pinned_client_config(impronta))` (o equivalente) ottiene 200 da `/api/v1/health`.
- `self_mode_rejects_plain_http`: una richiesta `http://` alla stessa porta non ottiene una risposta HTTP valida.
- `self_mode_keeps_its_identity_across_restarts`: due avvii sulla stessa cartella dati → stessa impronta.
- `server_info_reports_self_and_no_phone`: `GET /api/v1/server` → `tls == "self"`, `phone_ready == false`.
- `fingerprint_subcommand_prints_what_the_server_printed`: esegui il binario (`env!("CARGO_BIN_EXE_bookeeper-server")`) come fanno i test esistenti in `tests/setup_code.rs`; le due righe coincidono con quelle dell'avvio; su una cartella senza identità esce con 1 e non crea `tls/`.
- `off_mode_is_unchanged`: i test di `tests/serve.rs` passano invariati.
- `acme_mode_starts_and_listens_without_a_certificate`: `--tls acme --domain libri.example.org --acme-directory https://127.0.0.1:1/dir` su `127.0.0.1:0`; la porta accetta connessioni TCP; l'handshake TLS fallisce o resta in attesa, ma il processo non termina e la chiusura ordinata funziona. Niente attese oltre 5 secondi.

## Limite dichiarato

L'emissione reale di un certificato non è provata da nessun test: richiede un dominio pubblico. Scrivilo nel rapporto, insieme a come l'hai controllata a mano, se l'hai fatto.

## Acceptance criteria

- `cargo test -p bookeeper-server` passa, test nuovi e vecchi.
- `cargo clippy -p bookeeper-server --all-targets -- -D warnings` è pulito.
- `cargo tree -i aws-lc-rs` e `cargo tree -i openssl-sys` non trovano alcun pacchetto.
- `cargo run -p bookeeper-server -- --tls self --data-dir <tmp> --bind 127.0.0.1 --port <libera> --mdns off` stampa le quattro righe del contratto, nell'ordine.
- Cambiano solo: `crates/bookeeper-server/src/tls.rs`, `src/lib.rs`, `src/main.rs`, `src/config.rs`, `tests/tls.rs`, ed eventualmente `crates/bookeeper-server/Cargo.toml` e `Cargo.lock`.
