Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Backup programmato con rotazione

## Obiettivo

Backup automatici nella cartella dati, sia nell'app desktop sia sul server (design §6.5). Pianificatore in `crates/bookeeper-core/src/backup_schedule.rs` (nuovo file: dichiaralo con `#[path]` dentro `backup.rs` come sottomodulo `schedule`, senza toccare `lib.rs`), rotte `/backups` in `api/backup.rs`, avvio nei due eseguibili. Usa `backup::create_archive`.

## Configurazione

Per libreria, in `server_meta` alla chiave `backup_config:<library_id>`, come JSON `{ "interval_days": u32, "keep": u32 }`. Predefinito, quando la riga manca: `{ "interval_days": 3, "keep": 5 }`. `interval_days: 0` spegne i backup automatici. Limiti: `interval_days` 0–90, `keep` 1–50.

## Rotte (`admin` o superiore)

- `GET /backups/config` → la configurazione effettiva.
- `PUT /backups/config` `{interval_days, keep}` → 200 con i valori salvati; fuori limite → 422 `validation`.
- `GET /backups` → `{ "items": [ { "name", "created_at", "size_bytes" } ] }`, i backup automatici di questa libreria, dal più recente.

## File

`backups_dir/<library_id>/auto-<AAAAMMGG-HHMMSS>.zip`. Scritto prima con estensione `.tmp` e poi rinominato, così un backup interrotto non sembra completo. I nomi vengono solo dall'id della libreria e dall'ora.

## Pianificatore

```rust
/// Un giro: per ogni libreria con backup attivi, se l'ultimo backup automatico è più vecchio di interval_days
/// (o non esiste), ne crea uno e poi cancella i più vecchi oltre `keep`. Restituisce quanti ne ha creati.
pub async fn run_once(state: &AppState, now: i64) -> usize;
/// Avvia un task che chiama run_once all'avvio e poi ogni ora. Va chiamata una volta per processo.
pub fn spawn(state: AppState) -> tokio::task::JoinHandle<()>;
```

- Un errore su una libreria viene registrato con `tracing::error!` e non ferma le altre.
- La rotazione cancella solo i file `auto-*.zip` di quella libreria: mai altro.
- I file `.tmp` rimasti da un giro interrotto e più vecchi di un'ora vengono cancellati.
- Due giri sovrapposti non creano due backup per la stessa libreria: tieni un lucchetto per libreria.
- Ogni backup automatico scrive l'audit `library.backup` con `user_id` e `device_id` nulli e `detail` `{ "automatic": true }` (inserimento diretto in `audit_log`: `audit::record` richiede un utente).

## Eseguibili

`crates/bookeeper-server/src/lib.rs` (in `serve` o dove nasce lo stato) e `apps/desktop/src-tauri/src/lib.rs` chiamano `backup::schedule::spawn(state.clone())` una volta. Se per farlo serve esporre lo stato da `build()`, aggiungi una funzione accanto senza cambiare la firma di `build()`.

## Test (`crates/bookeeper-core/tests/backup_schedule.rs`)

`run_once` con `now` esplicito; nessun test aspetta il tempo reale.

- `first_run_creates_a_backup_for_each_library`.
- `no_new_backup_before_the_interval`; `new_backup_after_the_interval`.
- `interval_zero_disables`.
- `rotation_keeps_only_the_newest`: con `keep: 2`, dopo quattro giri distanziati restano i due più recenti.
- `rotation_never_touches_other_files`: un file `nota.txt` e un `manuale.zip` nella cartella restano.
- `stale_tmp_files_are_removed_and_fresh_ones_kept`.
- `a_failing_library_does_not_stop_the_others`: `backups_dir/<id>` di una libreria è un file invece di una cartella.
- `overlapping_runs_create_one_backup`: due `run_once` insieme → un solo file.
- `automatic_backups_are_audited`.
- `created_archive_restores`: l'archivio creato dal pianificatore si apre con `zip` e contiene `manifest.json`.
- Rotte: `config_defaults`; `config_round_trips`; `config_out_of_range_is_validation`; `list_shows_only_this_librarys_backups_newest_first`; `routes_need_admin`; `routes_need_a_token`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test backup_schedule` passa con tutti i test elencati.
- `cargo test -p bookeeper-core --test backup_api` e `cargo test -p bookeeper-server --test serve --test setup_code` passano ancora.
- `cargo check -p bookeeper-desktop` compila.
- Cambiano solo `backup.rs` (la sola riga del sottomodulo), `backup_schedule.rs`, `api/backup.rs`, `tests/backup_schedule.rs`, i due `lib.rs` degli eseguibili.
- `cargo clippy -p bookeeper-core -p bookeeper-server --all-targets -- -D warnings` è pulito.
