Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Apertura all'accesso», «Libreria più nuova dell'app»). Sono già unite `setup-core-win` (`bookeeper_setup_core::autostart`), `setup-app` e `setup-assemble`, che ha toccato `tauri.conf.json` dell'app.

# App desktop (Rust): apertura all'accesso, una sola istanza, libreria troppo nuova

## File
- Modifica:
  - `apps/desktop/src-tauri/Cargo.toml` e `Cargo.lock`;
  - `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/updates.rs`;
  - `apps/desktop/src-tauri/tauri.conf.json`: la finestra `main` nasce con `"visible": false`.
- Crea:
  - `apps/desktop/src-tauri/src/autostart.rs`, `apps/desktop/src-tauri/src/startup.rs`;
  - `apps/desktop/src-tauri/tests/startup.rs`.

## Interfacce
- **Usa:** `bookeeper_setup_core::autostart::{enable, disable, is_enabled}` su Windows; `tauri-plugin-autostart` sul Mac (`MacosLauncher::LaunchAgent`) e su Linux, con l'argomento `--autostart`.
- **Produce:**
  - i comandi Tauri `autostart_get() -> bool` e `autostart_set(on: bool)`, registrati in `lib.rs`. La task `app-autostart-ui` li usa;
  - in `startup.rs`:
    - `enum LaunchMode { Normal, Minimized }`;
    - `fn launch_mode(args: &[String], update_marker: bool) -> LaunchMode`;
    - `const UPDATE_MARKER: &str = ".updating"`;
    - `fn newer_library_message() -> &'static str`.

## Cosa fare
- **Una sola istanza:** `tauri-plugin-single-instance` come primo plugin. Un secondo avvio toglie la riduzione a icona, mostra e mette a fuoco la finestra `main`.
- **Avvio:**
  - dopo aver preparato lo stato, legge il segno `UPDATE_MARKER` nella cartella dei dati, lo cancella e chiama `launch_mode`;
  - `Minimized` (c'è `--autostart` e non c'è il segno) riduce a icona e poi mostra; `Normal` mostra e basta.
- **Segno dell'aggiornamento:** `updates::install` scrive il file `UPDATE_MARKER` prima di `download_and_install`.
- **Libreria più nuova:**
  - se `Db::open` restituisce `DbError::NewerSchema`, l'app non mostra la finestra;
  - apre un messaggio di sistema con `tauri-plugin-dialog` (`MessageDialogKind::Error`, titolo «Bookeeper», testo `newer_library_message()`), non bloccante, e alla chiusura esce con 1;
  - il testo è in due lingue, perché arriva prima dell'interfaccia: «Questa libreria è di una versione più recente di Bookeeper. Installa la versione più recente per aprirla.» e «This library comes from a newer version of Bookeeper. Install the latest version to open it.»;
  - gli altri errori restano come oggi.

## Test
- **`tests/startup.rs`:**
  - `launch_mode`: `--autostart` senza segno → `Minimized`; `--autostart` con il segno → `Normal`; senza `--autostart` → `Normal`;
  - il testo del messaggio contiene entrambe le lingue.
- `cargo test -p bookeeper-desktop` resta verde.

## Acceptance criteria
- `cargo test -p bookeeper-desktop` e `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` passano.
- Cambiano solo i file dichiarati.
