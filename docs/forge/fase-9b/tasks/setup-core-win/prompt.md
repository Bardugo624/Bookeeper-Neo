Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md`: «Sicurezza del Setup», «Lo stato installato», «Disinstallare», «Apertura all'accesso». La task `setup-core-logic` è già unita: implementa il suo `trait System`.

# Core del Setup: il sistema vero su Windows e l'apertura all'accesso

## File
- Riempi `crates/bookeeper-setup-core/src/sys/windows/` (`mod.rs` più i moduli che servono, per esempio `registry.rs`, `folders.rs`, `process.rs`, `credentials.rs`, `shortcut.rs`).
- Riempi `crates/bookeeper-setup-core/src/autostart.rs`.
- Crea `crates/bookeeper-setup-core/tests/windows.rs`, tutto dietro `#![cfg(windows)]`.

## Interfacce
- Produce:
  - `sys::windows::WindowsSystem`, che implementa `System`;
  - `sys::windows::platform() -> Box<dyn System>`;
  - `autostart::{enable, disable, is_enabled}`, con le firme del contratto. Li userà anche l'app desktop (task `app-autostart`).
- Fuori da Windows, `autostart::*` restituisce `ErrorKind::Unsupported`.

## Come
Usa `winreg` 0.56, `windows-sys` 0.59 o `windows` 0.62 (già in `Cargo.lock`) e `self-replace`.

- **`install_state`:**
  - legge il valore predefinito di `HKCU\Software\bookeeper\Bookeeper`; se manca, `InstallLocation` senza virgolette;
  - legge `DisplayVersion`;
  - accetta solo percorsi assoluti su un disco locale.
- **Cartelle:**
  - `SHGetKnownFolderPath` per `FOLDERID_Desktop`, `FOLDERID_Programs`, `FOLDERID_LocalAppData` e `FOLDERID_RoamingAppData`;
  - `temp_dir` da `GetTempPath2W`, con ripiego su `GetTempPathW`.
- **Disco:**
  - `free_space` con `GetDiskFreeSpaceExW`;
  - `is_network_path` per i percorsi `\\` e per le lettere con `GetDriveTypeW == DRIVE_REMOTE`;
  - `can_write` crea le cartelle mancanti, scrive e cancella un file, poi toglie solo le cartelle che ha creato.
- **Processi e permessi:**
  - `is_running`: istantanea dei processi (`CreateToolhelp32Snapshot`) e `QueryFullProcessImageNameW`, confronto dei percorsi senza badare alle maiuscole;
  - `is_elevated`: `TokenElevation` del processo.
- **`has_webview2`:** le chiavi `EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`, valore `pv`, sotto `HKLM\SOFTWARE\WOW6432Node\Microsoft` e `HKCU\SOFTWARE\Microsoft`. Accetta un valore non vuoto e diverso da `0.0.0.0`.
- **`run_and_wait`:**
  - `Command::new(program)` più `raw_arg(raw_args)` (MAI `arg`), più le variabili d'ambiente date;
  - attende con `try_wait` fino al limite, poi `kill` e `TimedOut`.
- **`shortcut_target`:** il destinatario del `.lnk` con `IShellLinkW` e `IPersistFile`; `Ok(None)` se il file non c'è.
- **Apertura all'accesso:**
  - `enable` scrive `Run\Bookeeper` = `"<exe>" --autostart` e `StartupApproved\Run\Bookeeper` = `02` più 11 zeri;
  - `disable` cancella entrambi i valori;
  - `is_enabled` è vero se c'è `Run\Bookeeper` e il primo byte di `StartupApproved` manca o è pari.
- **`delete_credentials_with_suffix`:** `CredEnumerateW` senza filtro, poi `CredDeleteW` per ogni nome che finisce con il suffisso, senza badare alle maiuscole. Restituisce quante ne ha cancellate.
- **Registro:**
  - `delete_registry_tree` per una chiave sotto `HKCU`;
  - `delete_registry_key_if_empty` solo se la chiave non ha né sottochiavi né valori.
- **`self_delete_outside`:** `self_replace::self_delete_outside_path`.

## Test (`tests/windows.rs`, girano solo in CI su Windows)
- Tutti su chiavi di prova `HKCU\Software\BookeeperTest\<uuid>`, mai su quelle vere. Per questo `WindowsSystem` accetta una radice di registro diversa, tramite un costruttore solo per i test.
- `autostart_round_trip` e `autostart_disabled_by_task_manager_reads_off` (primo byte `03`).
- `credentials_with_suffix_are_deleted`: crea due credenziali generiche con il suffisso e una senza, poi controlla.
- `install_state_strips_quotes`.
- `run_and_wait_passes_raw_args`: lancia `cmd /c echo` con una cartella con spazi e legge l'uscita.
- `is_network_path_for_unc`.
- `free_space_of_system_drive_is_positive`.

## Acceptance criteria
- `cargo check --target x86_64-pc-windows-msvc -p bookeeper-setup-core --all-targets` passa.
- Su Linux `cargo test -p bookeeper-setup-core` e `cargo clippy -p bookeeper-setup-core --all-targets -- -D warnings` passano.
- Cambiano solo i file dichiarati.
