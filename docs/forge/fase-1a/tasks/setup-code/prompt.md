Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Server: codice di setup all'avvio e da riga di comando

## Obiettivo

Far arrivare il codice di setup a chi installa il server. File: `crates/bookeeper-server/src/lib.rs`, `src/main.rs`, `tests/setup_code.rs`. Usa `bookeeper_core::api::setup::{new_setup_code, library_count}`; se non sono esposte dal core, fermati e dillo.

## Comportamento

1. **All'avvio**, dopo aver aperto il database e prima di servire: se non esiste alcuna libreria, genera un codice nuovo e stampalo su stdout, su una riga a sé:

   ```
   Codice di setup: XXXX-XXXX-XXXX
   ```

   Se esiste almeno una libreria non stampa nulla e non genera nulla. Ogni avvio senza librerie sostituisce il codice precedente.

2. **Sottocomando** `bookeeper-server setup-code [--data-dir <dir>]`: apre il database, genera un codice nuovo, lo stampa nello stesso formato ed esce con 0, senza aprire porte. Funziona anche quando esistono già librerie: serve a crearne un'altra. Può girare mentre il server è in esecuzione sulla stessa cartella dati: il server accetta il codice nuovo senza riavvio.

3. L'avvio senza sottocomando resta com'è oggi: stessi flag (`--data-dir`, `--bind`, `--port`), stesse variabili d'ambiente, stessa riga `Bookeeper <versione> in ascolto su http://<addr>`.

4. Il codice va solo su stdout. Non passa da `tracing` e non finisce in nessun file.

## Forma

- `Config` resta il tipo dei flag di avvio. Aggiungi un `enum Command { SetupCode { data_dir } }` facoltativo al parser di `clap`.
- In `lib.rs`:

  ```rust
  /// Apre (o crea) il database della cartella dati.
  pub fn open_db(data_dir: &Path) -> Result<Db, StartError>;
  /// Some(codice) se non esiste alcuna libreria, altrimenti None.
  pub fn startup_setup_code(db: &Db) -> Result<Option<String>, StartError>;
  /// Genera sempre un codice nuovo.
  pub fn issue_setup_code(db: &Db) -> Result<String, StartError>;
  ```

  `build()` continua a esistere con la stessa firma e usa `open_db`. I test esistenti in `tests/serve.rs` non vanno modificati e devono passare.

## Test (`crates/bookeeper-server/tests/setup_code.rs`)

- `startup_code_exists_only_without_libraries`: su una cartella dati nuova `startup_setup_code` restituisce `Some` nel formato `^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$`; dopo un setup riuscito restituisce `None`.
- `startup_code_opens_setup_over_http`: avvia il server su porta 0, fa `POST /api/v1/setup` con quel codice, email e password → 201.
- `wrong_code_over_http_is_rejected`: 403 `setup_code_invalid`.
- `issued_code_replaces_the_previous_one`: dopo `issue_setup_code` il codice vecchio → 403 e quello nuovo → 201.
- `issue_works_when_libraries_exist`: con una libreria già creata, un codice nuovo permette di crearne una seconda.
- `setup_code_subcommand_prints_a_code_and_exits`: esegue il binario (`env!("CARGO_BIN_EXE_bookeeper-server")`) con `setup-code --data-dir <tmp>`: uscita 0, stdout contiene una riga `Codice di setup: ` seguita dal codice, nessuna porta aperta.
- `server_prints_the_code_on_first_start`: avvia il binario con `--port 0 --bind 127.0.0.1` su una cartella nuova, legge stdout finché trova `Codice di setup:`, poi termina il processo.

## Acceptance criteria

- `cargo test -p bookeeper-server --test setup_code` passa con i sette test.
- `cargo test -p bookeeper-server --test serve` passa senza modifiche a quel file.
- Solo `src/lib.rs`, `src/main.rs`, `tests/setup_code.rs` sono cambiati.
- `bookeeper-server --help` elenca il sottocomando `setup-code`.
- `cargo clippy -p bookeeper-server --all-targets -- -D warnings` è pulito.
