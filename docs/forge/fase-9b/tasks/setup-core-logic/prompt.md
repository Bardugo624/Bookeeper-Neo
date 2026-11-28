Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md`: «Il file che si scarica», «Installare», «Personalizzare», «Disinstallare», «Modalità silenziosa».

# Core del Setup: formato, righe di comando, cartella, avanzamento, interfaccia di sistema

## File
- Crea `crates/bookeeper-setup-core/`:
  - `Cargo.toml`, con tutte le dipendenze del crate, comprese quelle che useranno `setup-core-ops` e `setup-core-win` (elenco nel contratto, «Regole»);
  - `src/lib.rs` con tutti i moduli del contratto;
  - `src/payload.rs`, `src/version.rs`, `src/cmdline.rs`, `src/folder.rs`, `src/progress.rs`, `src/sys/mod.rs`, `src/sys/mock.rs`;
  - segnaposto con un solo commento di modulo: `src/ops.rs`, `src/quiet.rs`, `src/log.rs`, `src/autostart.rs`, `src/sys/windows/mod.rs` (dietro `#[cfg(windows)]`);
  - `tests/fixtures/tail.bin`: metadati d'esempio più coda, scritti con `encode_tail` (il test Node di `setup-assemble` lo rilegge).
- Modifica `Cargo.lock`.

## Interfacce prodotte
Tutte quelle del contratto per `payload`, `version`, `cmdline`, `folder`, `progress` e `sys`. In più:
- `MockSystem::new(root: &Path)`: cartelle finte sotto `root` (dati, temp, desktop, programmi);
- stato e registri in memoria, leggibili dai test (`installed`, `autostart`, `credentials`, `registry_keys`, `runs`);
- `on_run(callback)`: simula NSIS, per esempio scrivendo file nella cartella di destinazione.

`platform()` fuori da Windows restituisce un sistema che risponde `ErrorKind::Unsupported`. Su Windows chiama `windows::platform()`: nel segnaposto `sys/windows/mod.rs` dichiaralo come `pub fn platform() -> Box<dyn System>` che per ora restituisce lo stesso sistema `Unsupported`. `setup-core-win` lo sostituisce.

## Cosa decidere, e come
- **`payload::locate`:**
  - legge la coda alla fine del file. Se il file è un PE con una tabella dei certificati che finisce alla fine del file, la cerca subito prima della tabella;
  - controlla che le lunghezze stiano dentro il file;
  - `None` se manca `BKSETUP1`.
- **`cmdline`:** `install_args` e `uninstall_args` restituiscono esattamente `/S /D=<dir>`, `/S /UPDATE /D=<dir>`, `/S _?=<dir>`.
- **`parse_invocation`:**
  - divide alla maniera di Windows solo la parte prima di ` _?=`; quel che segue ` _?=` è la cartella, spazi compresi;
  - riconosce `--quiet`, `--dir=`, `--no-desktop`, `--autostart`, `--uninstall`, `--delete-data`, `/P`, `/UPDATE` e `--smoke-ui`;
  - un argomento sconosciuto è un errore.
- **`target_for_choice`:** aggiunge `Bookeeper` se la cartella scelta non si chiama così (senza badare alle maiuscole) e non è vuota.
- **`ProgressModel`:** le fasce del design. Per l'installazione: Preparo 0–8%, Copio 8–90%, Icone 90–96%, Fine 96–100%. Per la disinstallazione: Tolgo l'app 0–70%, Cancello i dati 70–95% (solo con `delete_data`), Fine 95–100%.
  - `Unpacked { bytes, total }` muove la barra dentro «Copio».
  - Senza segnali, la barra segue la stima con una curva che rallenta, e non tocca il 90% prima di `MainComplete`.
  - Mai indietro. Ogni passo resta almeno 600 ms, tutta l'operazione almeno 3 s. `done` arriva solo dopo `Finished` e dopo i tempi minimi.

## Test (`cargo test -p bookeeper-setup-core`)
- `locate_reads_tail_written_by_encode_tail`, `locate_returns_none_without_magic`, `locate_rejects_lengths_outside_file`, `locate_finds_tail_before_certificate_table` (un PE minimo costruito nel test).
- `install_args_keep_spaces_and_accents_unquoted`: `C:\Prova Bookeeper\Libreria è` → esattamente `/S /D=C:\Prova Bookeeper\Libreria è`. Stesso controllo per `/UPDATE` e `_?=`.
- `parse_uninstall_from_nsis_reinstall_page`: `"C:\x\bookeeper-setup.exe" --uninstall /P _?=C:\Users\Mario Rossi\AppData\Local\Bookeeper` → `passive`, cartella con lo spazio.
- `parse_quiet_install`, `parse_rejects_unknown_flag`, `parse_gui_without_flags`.
- `compare_orders_betas_and_releases`, `legacy_below_two`.
- `target_appends_bookeeper_to_non_empty_folder`, `target_keeps_folder_named_bookeeper`, `check_space_margin_and_temp`.
- Avanzamento:
  - `progress_never_goes_backwards`;
  - `progress_waits_for_main_complete_before_ninety`;
  - `progress_respects_minimum_durations`;
  - `progress_follows_unpacked_bytes`;
  - `uninstall_progress_skips_data_band_when_keeping`.
- `mock_system_records_runs_and_registry`.

## Acceptance criteria
- `cargo test -p bookeeper-setup-core` e `cargo clippy -p bookeeper-setup-core --all-targets -- -D warnings` passano.
- `cargo check --target x86_64-pc-windows-msvc -p bookeeper-setup-core` passa.
- Cambiano solo i file dichiarati.
