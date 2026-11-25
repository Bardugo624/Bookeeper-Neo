Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Server: annuncio mDNS all'avvio

## Obiettivo

`bookeeper-server` si annuncia in rete locale, così il percorso "Unisciti" del desktop lo elenca (design §6.4). Il codice di annuncio esiste (`bookeeper_net::mdns`, da `net-mdns`); il flag `--mdns on|off` pure (`config.rs`). Qui li si collega.

## Cosa fare

1. **`src/announce.rs`** (nuovo, nel crate del server).
   - `pub fn announcement(cfg: &Config, port: u16) -> Announcement` (funzione pura): `instance` = `Bookeeper su <nome della macchina>` (`gethostname`; nome non leggibile → `Bookeeper`); `port` = la porta **realmente** in ascolto; `version` = `bookeeper_core::VERSION`; `tls` = `"off"`, `"self"` o `"acme"`; `url` = `cfg.public_url()`.
   - `pub fn start(cfg: &Config, port: u16) -> Option<Announcer>`: con `--mdns off` restituisce `None` senza fare nulla. Con `on` chiama `announce`. Un errore **non ferma il server**: un avviso a livello `warn` con il motivo, e `None`.
   - Con `--bind 127.0.0.1` (o altro indirizzo di loopback) non si annuncia: il server non è raggiungibile dalla rete. `None`, senza avviso.
2. **`src/main.rs`**: avvia l'annuncio dopo che il server è in ascolto e tieni l'`Announcer` vivo fino alla fine del processo; alla chiusura ordinata viene rilasciato prima dell'uscita. Riga stampata su stdout quando l'annuncio parte, dopo le righe del contratto: `Annunciato in rete locale come "<istanza>".`
3. **`src/lib.rs`**: dichiara il modulo e riesporta ciò che serve ai test.

## Test

`crates/bookeeper-server/tests/announce.rs`:

- `announcement_carries_port_version_and_mode`: per `off`, `self`, `acme` (con dominio): `tls` giusto, `version` uguale a `bookeeper_core::VERSION`, porta quella passata e non quella della configurazione.
- `announcement_url_follows_the_public_url`: assente con `off` senza indirizzo; presente con `--public-url`; con `acme` è `https://<dominio>`.
- `instance_mentions_the_host_name`: inizia con `Bookeeper`.
- `mdns_off_announces_nothing`: `start` → `None`.
- `a_loopback_bind_announces_nothing`: `--bind 127.0.0.1` con `--mdns on` → `None`.
- `the_server_runs_with_mdns_on`: esegui il binario con `--mdns on --bind 0.0.0.0` su una porta libera scelta dal test; il processo stampa la riga `in ascolto` e risponde a `/api/v1/health` sia che l'annuncio riesca sia che fallisca. Non affermare nulla sulla riga `Annunciato`: in un contenitore il multicast può mancare.

## Acceptance criteria

- `cargo test -p bookeeper-server` passa, test nuovi e vecchi.
- `cargo clippy -p bookeeper-server --all-targets -- -D warnings` è pulito.
- Nessun test esistente parte più lento di prima per colpa dell'annuncio: i test che avviano il server in processo non annunciano (usano `127.0.0.1`).
- Cambiano solo: `crates/bookeeper-server/src/announce.rs`, `src/lib.rs`, `src/main.rs`, `tests/announce.rs`. Se manca una dipendenza, fermati e dillo.
