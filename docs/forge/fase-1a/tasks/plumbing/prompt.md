Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Fondamenta: dipendenze, database asincrono, stato dell'app

## Obiettivo

Preparare il core perché le task successive non debbano più toccare `Cargo.toml`, `state.rs` né i due eseguibili.

## Cosa fare

1. **Dipendenze** in `crates/bookeeper-core/Cargo.toml` (ultime versioni stabili compatibili): `argon2`, `jsonwebtoken` (algoritmo HS256; se la versione richiede di scegliere un backend crittografico, usa quello in puro Rust), `rand`, `sha2`, `hex`, `uuid` con le feature `v7` e `serde`, `tokio` con `rt`, `sync`, `time`. Aggiorna `Cargo.lock`. Nessun'altra task potrà aggiungerne: se una di queste non compila, risolvilo qui.

2. **`Db::run`** in `crates/bookeeper-core/src/db/mod.rs`:

   ```rust
   pub async fn run<R: Send + 'static>(
       &self,
       f: impl FnOnce(&mut rusqlite::Connection) -> rusqlite::Result<R> + Send + 'static,
   ) -> Result<R, DbError>
   ```

   Esegue `f` con `tokio::task::spawn_blocking` sulla stessa connessione e con lo stesso recupero dal mutex avvelenato di `Db::with`. Un task interrotto o andato in panic diventa `DbError::Task(String)` (nuova variante). `Db::with` resta.

3. **`AppState`** in `crates/bookeeper-core/src/state.rs`:

   ```rust
   #[derive(Clone, Copy, Debug, PartialEq, Eq)]
   pub enum SetupPolicy { Open, CodeRequired }

   #[derive(Clone)]
   pub struct AppState {
       pub version: &'static str,
       pub db: Db,
       pub jwt_secret: std::sync::Arc<[u8]>,
       pub setup_policy: SetupPolicy,
   }

   impl AppState {
       pub fn open(db: Db, setup_policy: SetupPolicy) -> Result<AppState, DbError>;
       pub fn for_tests() -> AppState;   // database in memoria, SetupPolicy::Open
   }
   ```

   `open` legge il segreto dalla riga `jwt_secret` di `server_meta` (32 byte casuali, in esadecimale). Se manca lo crea con `INSERT OR IGNORE` e poi lo rilegge, così due processi che partono insieme usano lo stesso segreto. Riesporta `SetupPolicy` da `lib.rs`.

4. **Chi costruisce lo stato**: `crates/bookeeper-server/src/lib.rs` usa `AppState::open(db, SetupPolicy::CodeRequired)`; `apps/desktop/src-tauri/src/lib.rs` usa `AppState::open(db, SetupPolicy::Open)`. Nessuno costruisce più `AppState { .. }` a mano.

## Test (`crates/bookeeper-core/tests/plumbing.rs`)

- `run_executes_on_the_shared_connection`: una scrittura fatta con `run` è visibile a una lettura successiva con `run`.
- `run_does_not_block_the_runtime`: in un runtime a thread singolo (`#[tokio::test]`), un `run` che dorme 200 ms e un `tokio::time::sleep(10 ms)` avviati insieme con `tokio::join!` finiscono in meno di 400 ms, e lo sleep breve finisce per primo.
- `a_panic_inside_run_is_a_task_error`: la closure va in panic → `Err(DbError::Task(_))`, e il `run` seguente funziona.
- `jwt_secret_survives_reopening`: su file, due `AppState::open` successivi hanno lo stesso segreto di 32 byte.
- `jwt_secret_differs_between_databases`: due database in memoria hanno segreti diversi.

## Acceptance criteria

- `cargo test -p bookeeper-core --test plumbing` passa con i cinque test sopra.
- `cargo test -p bookeeper-core --test health --test errors --test db` passa ancora.
- `cargo test -p bookeeper-server --test serve` passa ancora.
- `cargo check -p bookeeper-desktop` compila (su Linux servono le librerie di sistema di Tauri, già installate).
- `cargo clippy -p bookeeper-core -p bookeeper-server --all-targets -- -D warnings` è pulito.
- `grep -rn "AppState {" crates apps --include=*.rs` trova solo la definizione e i due costruttori in `state.rs`.
- Il segreto non compare in nessun log né in `Debug`.
