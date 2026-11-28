Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md`: «Sicurezza del Setup», «Modalità silenziosa», «Interfaccia», «Rischi» (WebView2 mancante). Le task del core sono già unite: usa `bookeeper-setup-core`.

# Il Setup: la mini-app Tauri

## File
- Crea `apps/setup/src-tauri/`:
  - `Cargo.toml`, `build.rs`, `tauri.conf.json`;
  - `capabilities/default.json`, `windows/app.manifest`;
  - `src/main.rs`, `src/lib.rs`, `src/commands.rs`, `src/window.rs`;
  - `tests/commands.rs`.
- Modifica `Cargo.toml` alla radice (`apps/setup/src-tauri` fra i `members`) e `Cargo.lock`.

## Interfacce
- Usa: `bookeeper_setup_core::{cmdline::parse_invocation, ops, quiet, sys::platform, payload, folder, version, log::Log}`.
- Produce: i comandi e gli eventi del contratto («Comandi del Setup»), con i tipi in `camelCase`. L'interfaccia (task `setup-ui-shell`) li chiama per nome.

## Cosa fare
- **`tauri.conf.json`:**
  - `productName` «Bookeeper Setup», `identifier` `org.bookeeper.setup`, nessuna `version`: la prende da Cargo;
  - `build.frontendDist` `../dist`, `devUrl` `http://localhost:5175`, `beforeDevCommand` `npm run dev`, `beforeBuildCommand` `npm run build`;
  - `app.windows` vuoto: la finestra la crea il codice;
  - `bundle.active` falso; icone prese da `../../desktop/src-tauri/icons/`.
- **`build.rs`:**
  - crea `../dist/index.html` segnaposto se manca, come l'app desktop;
  - con target Windows e MSVC aggiunge `cargo:rustc-link-arg-bins=/DEPENDENTLOADFLAG:0x800`;
  - passa a `tauri_build` il manifest `windows/app.manifest`: quello predefinito di Tauri (controlli comuni v6) più `requestedExecutionLevel level="asInvoker"`.
- **`main.rs`, in quest'ordine:**
  1. su Windows `SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32)`;
  2. legge la riga grezza (`GetCommandLineW` su Windows, gli argomenti uniti altrove) con `parse_invocation`. Una riga non valida esce con 2;
  3. `QuietInstall`, oppure `Uninstall` con `quiet` o `passive`: `std::process::exit(quiet::run(...))`, senza Tauri né WebView2;
  4. senza WebView2: il Setup completo estrae l'installer e lo lancia senza `/S`, il leggero lancia `<cartella>\uninstall.exe`; poi esce;
  5. altrimenti avvia Tauri.
- **Tauri (`lib.rs`):**
  - plugin `tauri-plugin-single-instance` per primo. Un secondo avvio mette a fuoco la finestra; se ha `--uninstall` emette `setup://uninstall-requested`;
  - plugin `tauri-plugin-dialog`.
- **Finestra (`window.rs`):**
  - `WebviewWindowBuilder` con etichetta `main`, 800×520, `resizable(false)`, `maximizable(false)`, `decorations(false)`, `center()`, `visible(false)`, titolo «Bookeeper Setup»;
  - `data_directory` in `%TEMP%\bookeeper-setup-webview-<casuale>`;
  - all'avvio cancella le cartelle `bookeeper-setup-webview-*` più vecchie di un giorno.
- **Comandi (`commands.rs`), sottili:**
  - `setup_info` costruisce `SetupInfo` con le regole del contratto. Modalità e `blocked`: `elevated` se `is_elevated`; `incomplete` per un Setup senza coda partito fuori dalla cartella installata e senza `--uninstall`; `unsupported` fuori da Windows;
  - `check_dir` applica `target_for_choice`, le regole della cartella e `check_space`;
  - `install` e `uninstall` girano in un filo a parte ed emettono `setup://progress`. Gli errori diventano `OpResult` secondo il contratto;
  - `launch_app` avvia `<cartella>\bookeeper-desktop.exe` e chiude il Setup;
  - `log_tail`;
  - `ready` mostra la finestra;
  - `quit { code }` chiude con quel codice.
- **`--smoke-ui`:** apre la finestra come sempre. Quando l'interfaccia chiama `ready`, aspetta 1 s ed esce con 0; senza `ready` entro 30 s esce con 2. Serve alla CI per provare WebView2, le DLL e l'interfaccia.
- **Capability:**
  - `core:default`;
  - `core:window:allow-minimize`, `core:window:allow-close`, `core:window:allow-start-dragging`;
  - `core:event:default`, `dialog:allow-open`.

## Test (`tests/commands.rs`, con `MockSystem`)
- `setup_info_install_mode_with_payload`.
- `setup_info_light_in_install_dir_is_uninstall`.
- `setup_info_light_elsewhere_is_incomplete`.
- `setup_info_elevated_is_blocked`.
- `setup_info_marks_legacy`.
- `check_dir_appends_bookeeper_and_reports_space`.
- `op_errors_map_to_results`.
- `invocation_routes_quiet_and_passive_to_quiet_run`: la funzione che sceglie la strada, senza avviare nulla.

## Acceptance criteria
- `cargo test -p bookeeper-setup` e `cargo clippy -p bookeeper-setup --all-targets -- -D warnings` passano su Linux.
- `cargo build -p bookeeper-setup` passa su Linux.
- Cambiano solo i file dichiarati.
