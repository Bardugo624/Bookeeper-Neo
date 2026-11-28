Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md`: «Lo stato installato», «Installare», «Aggiornare e riparare», «Disinstallare», «Modalità silenziosa». La task `setup-core-logic` è già unita: usa i suoi moduli e `MockSystem`.

# Core del Setup: installare, disinstallare, modalità silenziosa, registro

## File
- Riempi `crates/bookeeper-setup-core/src/ops.rs`, `src/quiet.rs`, `src/log.rs`. Se servono sottomoduli, mettili in `src/ops/`.
- Crea `crates/bookeeper-setup-core/tests/ops.rs` e `tests/quiet.rs`.

## Interfacce
- Usa: `payload`, `cmdline`, `folder`, `progress`, `version`, `sys::System`, `MockSystem`.
- Produce: `ops::{install, uninstall, data_summary, Mode, InstallOptions, DataSummary, OpError}`, `quiet::run`, `log::Log`, con le firme del contratto. In più `ops::read_state(sys) -> Option<InstallState>`, che applica le regole di «Lo stato installato» (cartella dal registro senza virgolette, `bookeeper-desktop.exe` presente).

## Cosa fare
- **`install`:**
  - legge la coda di `setup_exe`;
  - estrae l'installer in una cartella nuova con un nome casuale dentro `sys.temp_dir()`, creata in modo esclusivo;
  - tiene il file aperto (su Windows in sola lettura condivisa) mentre ne calcola lo SHA-256 e mentre NSIS gira;
  - lancia NSIS con `cmdline::install_args` e `TEMP`/`TMP` puntati a una cartella privata dentro quella dell'estrazione;
  - un filo separato manda `Snapshot` ogni 100 ms con questi segnali:
    - `Unpacked`: la dimensione del più grande `ns*.tmp` nella cartella privata, su `installed_bytes`;
    - `MainComplete`: `bookeeper-desktop.exe` con la dimensione dei metadati. In aggiornamento e riparazione conta solo dopo che il file è stato svuotato;
    - `NsisExited`;
  - dopo NSIS: dimensione e SHA-256 di `bookeeper-desktop.exe` uguali ai metadati, altrimenti `OpError::Verification`;
  - se l'icona sul desktop non è voluta, toglie `Bookeeper.lnk` dal desktop, solo se `shortcut_target` punta a `<dir>\bookeeper-desktop.exe`;
  - con `autostart` chiama `sys.autostart_enable`;
  - cancella la cartella temporanea; manda `Finished` e aspetta `done`.
- **Prima di tutto:** con `sys.is_running(<dir>\bookeeper-desktop.exe)` vero, `OpError::AppRunning` senza toccare nulla.
- **Codici di NSIS:** diverso da 0 → `NsisFailed`. Tempo scaduto → `TimedOut`: `run_and_wait` ha già chiuso il processo.
- **`uninstall`**, tutto nello stesso processo:
  - lancia `<dir>\uninstall.exe` con `cmdline::uninstall_args`;
  - controlla che `bookeeper-desktop.exe` non ci sia più;
  - cancella `uninstall.exe`, chiama `sys.self_delete_outside(dir)`, toglie la cartella se è vuota;
  - chiama `sys.autostart_disable()`;
  - con `delete_data`: `delete_credentials_with_suffix(".org.bookeeper.desktop")`, poi cancella le due cartelle dei dati, la chiave `Software\bookeeper\Bookeeper` e `Software\bookeeper` se resta vuota;
  - segnali `AppRemoved`, `DataRemoved`, `Finished`.
- **`data_summary`:** somma le due cartelle dei dati; `has_library` = esiste `bookeeper.sqlite`; `has_ebooks` = esiste `ebooks`.
- **`quiet::run`:**
  - non usa nulla di Tauri;
  - installazione: con la stessa versione ripara, con una più vecchia aggiorna nella sua cartella (`--dir` diverso → 2), con una più nuova o una 0.x esce con 4;
  - disinstallazione silenziosa o passiva (`/P`, `/UPDATE`): tiene i dati, salvo `--delete-data`;
  - con i permessi di amministratore esce con 2 e lo scrive nel registro, salvo `BOOKEEPER_SETUP_ALLOW_ELEVATED=1`;
  - codici del contratto.
- **`Log`:**
  - aggiunge righe con l'ora a `%TEMP%\Bookeeper-Setup.log`;
  - registra ogni comando lanciato e il suo codice;
  - `tail(200)`.

## Test (sistema finto, `cargo test -p bookeeper-setup-core`)
- `install_runs_nsis_with_exact_args`: riga registrata uguale a `/S /D=<dir>` con una cartella con spazi.
- `install_verifies_main_hash`: il finto NSIS scrive un `bookeeper-desktop.exe` diverso → `Verification`, anche con codice 0.
- `install_refuses_when_app_running`, `install_reports_nsis_failure_code`, `install_times_out`.
- `update_ignores_old_main_until_rewritten`: in aggiornamento il vecchio `bookeeper-desktop.exe` a piena dimensione non fa scattare `MainComplete`; scatta solo dopo che il finto NSIS l'ha svuotato e riscritto.
- `install_removes_only_our_desktop_shortcut`: un `Bookeeper.lnk` che punta altrove resta.
- `install_enables_autostart_when_asked`, `install_cleans_temp`, `install_progress_is_monotonic_and_finishes`.
- `uninstall_is_synchronous_and_complete`: al ritorno `bookeeper-desktop.exe` e `uninstall.exe` non ci sono più, `self_delete_outside` è stato chiamato.
- `uninstall_keep_leaves_data_and_credentials`.
- `uninstall_delete_removes_all_suffixed_credentials`: anche una credenziale che `connections.json` non elenca.
- `uninstall_delete_removes_data_dirs_and_registry`.
- `data_summary_reports_library_and_ebooks`.
- `quiet_codes`: 0, 3 (app aperta), 4 (più nuova, 0.x), 2 (`--dir` diverso, amministratore); con `BOOKEEPER_SETUP_ALLOW_ELEVATED=1` l'amministratore passa.
- `quiet_passive_uninstall_keeps_data`.
- `read_state_strips_quotes_and_requires_main_exe`.

## Acceptance criteria
- `cargo test -p bookeeper-setup-core` e `cargo clippy -p bookeeper-setup-core --all-targets -- -D warnings` passano.
- `cargo check --target x86_64-pc-windows-msvc -p bookeeper-setup-core` passa.
- Cambiano solo i file dichiarati.
