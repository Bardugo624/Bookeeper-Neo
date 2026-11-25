Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Server: sottocomando `healthcheck`

## Obiettivo

L'immagine Docker non contiene una shell né `curl`: il controllo di salute lo fa il binario stesso. `bookeeper-server healthcheck` esce con 0 se il server sulla stessa macchina risponde, con 1 altrimenti. Lo usa l'istruzione `HEALTHCHECK` (task `docker`).

## Cosa fare

1. **`src/config.rs`**: variante `Command::Healthcheck`. Legge la stessa configurazione del server (flag e variabili `BOOKEEPER_*`): porta e modalità TLS sono quelle effettive.
2. **`src/health.rs`** (nuovo): `pub async fn check(cfg: &Config) -> Result<(), String>`.
   - Indirizzo: `127.0.0.1` se `--bind` è `0.0.0.0`, `::1` se è `::`, altrimenti l'indirizzo di `--bind`. Porta: `listen_port()`.
   - Modalità `off`: richiesta `GET /api/v1/health` in HTTP/1.1 scritta a mano su `tokio::net::TcpStream` (`Connection: close`); riuscita se la riga di stato è `200`. Nessuna dipendenza nuova.
   - Modalità `self` e `acme`: riuscita se la connessione TCP si apre. Nessun handshake.
   - Tempo massimo complessivo: 3 secondi. Scaduto → errore.
3. **`src/main.rs`**: il sottocomando non apre il database, non crea la cartella dati, non stampa nulla in caso di successo; in caso di errore stampa una riga su stderr ed esce con 1.
4. **`src/lib.rs`**: dichiara il modulo.

## Test

`crates/bookeeper-server/tests/healthcheck.rs`:

- `succeeds_against_a_running_server`: server in processo su `127.0.0.1:0`; `check` con quella porta → `Ok`.
- `fails_when_nothing_listens`: porta libera appena chiusa → `Err` entro 3 secondi.
- `fails_when_the_port_answers_something_else`: ascoltatore TCP locale che risponde `HTTP/1.1 500 …` → `Err`.
- `fails_on_a_silent_peer_within_the_timeout`: ascoltatore che accetta e non scrive → `Err` in meno di 4 secondi.
- `tls_modes_only_need_the_port_open`: configurazione `self` verso un ascoltatore TCP qualunque → `Ok`.
- `the_subcommand_exits_0_or_1_and_creates_no_data_dir`: esegui il binario con `healthcheck --data-dir <cartella inesistente> --port <porta>` nei due casi; la cartella non viene creata.

## Acceptance criteria

- `cargo test -p bookeeper-server` passa, test nuovi e vecchi.
- `cargo clippy -p bookeeper-server --all-targets -- -D warnings` è pulito.
- `cargo run -p bookeeper-server -- --help` elenca `healthcheck`, `fingerprint`, `setup-code`.
- Cambiano solo: `crates/bookeeper-server/src/health.rs`, `src/config.rs`, `src/lib.rs`, `src/main.rs`, `tests/healthcheck.rs`. Nessun `Cargo.toml`.
