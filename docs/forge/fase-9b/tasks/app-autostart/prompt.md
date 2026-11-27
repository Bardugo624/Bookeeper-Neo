Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Apertura all'accesso», «Libreria più nuova dell'app»). Sono già unite `setup-core-win` (`bookeeper_setup_core::autostart`), `setup-app` e `setup-assemble`, che ha toccato `tauri.conf.json` dell'app.

# App desktop: apertura all'accesso, una sola istanza, libreria troppo nuova

## File
- Modifica:
  - `apps/desktop/src-tauri/Cargo.toml` e `Cargo.lock`;
  - `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/src/updates.rs`;
  - `apps/desktop/src-tauri/tauri.conf.json`: la finestra `main` nasce con `"visible": false`.
- Crea:
  - `apps/desktop/src-tauri/src/autostart.rs`, `apps/desktop/src-tauri/src/startup.rs`;
  - `apps/desktop/src-tauri/tests/startup.rs`.
- Modifica `apps/desktop/src/platform/` e `apps/desktop/src/modules/settings/sections/sharing/`, con i test.
- Modifica `packages/i18n/src/locales/it/sharing.json` e `en/sharing.json`.

## Interfacce
- **Usa:** `bookeeper_setup_core::autostart::{enable, disable, is_enabled}` su Windows; `tauri-plugin-autostart` sul Mac (`MacosLauncher::LaunchAgent`) e su Linux, con l'argomento `--autostart`.
- **Produce:**
  - i comandi Tauri `autostart_get() -> bool` e `autostart_set(on: bool)`;
  - in `Platform`, `autostart?: { get(): Promise<boolean>; set(on: boolean): Promise<void> }`, presente solo in `tauriPlatform`;
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
- **Impostazioni › Condivisione:** blocco «All'accesso» (`AutostartBlock.tsx`), sotto la condivisione. Solo con `platform.autostart`:
  - interruttore (casella con `role="switch"`, come quello della condivisione) «Apri Bookeeper all'accesso al computer»;
  - la nota;
  - un errore in `--bk-danger-strong`.
- **Testi** (`sharing.autostart.*`, italiano; l'inglese nello stesso tono):
  - `title` «All'accesso»;
  - `toggle` «Apri Bookeeper all'accesso al computer»;
  - `note` «Si apre ridotto a icona. Se condividi la libreria, i telefoni la trovano finché il computer è acceso.»;
  - `failed` «Non sono riuscito a cambiare l'apertura all'accesso.»

## Test
- **`tests/startup.rs`:**
  - `launch_mode`: `--autostart` senza segno → `Minimized`; `--autostart` con il segno → `Normal`; senza `--autostart` → `Normal`;
  - il testo del messaggio contiene entrambe le lingue.
- **Interfaccia (Vitest):**
  - il blocco c'è solo con `platform.autostart`;
  - lo stato iniziale arriva da `get`;
  - l'interruttore chiama `set`;
  - un errore mostra `failed` e rimette l'interruttore com'era.
- `cargo test -p bookeeper-desktop` resta verde.

## Acceptance criteria
- `cargo test -p bookeeper-desktop` e `cargo clippy --workspace --all-targets -- -D warnings` passano.
- `npm run typecheck -w @bookeeper/desktop` e `npx vitest run src/modules/settings src/platform` (da `apps/desktop`) passano.
- `impeccable detect --json` pulito sui file cambiati dell'interfaccia.
- Cambiano solo i file dichiarati.
