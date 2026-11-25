Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Backup: tre difetti rimasti dal run 1C

## Obiettivo

Chiudere tre difetti P3 del backup. Ogni correzione ha il suo test. Leggi `backup.rs`, `backup_schedule.rs`, `api/backup.rs` e i test esistenti prima di scrivere.

## Correzioni

1. **File datato nel futuro** (`backup_schedule.rs`, intorno a `backup_library`). Oggi un file `auto-…` con data futura rende il backup "dovuto" a ogni giro, e la rotazione lo tiene come più recente cancellando quelli veri. Regola: un backup automatico con `created_at > now + 300` è **ignorato**. Non conta per decidere se il backup è dovuto. Non conta nei `keep` della rotazione. Non viene cancellato. `GET /backups` continua a elencarlo.

2. **`authors_json` non validato** (`backup.rs`, lettura delle righe dell'archivio). Oggi il ripristino accetta qualunque testo; poi `GET /books?sort=author` risponde 500. Regola: al ripristino `authors_json` DEVE essere un array JSON di stringhe, altrimenti l'archivio è rifiutato con 400 `invalid_archive` e la libreria resta com'era. Applica lo stesso controllo a ogni altra colonna dell'archivio che il resto del core legge come JSON: cercale e dichiarale nel rapporto.

3. **Connessione tenuta durante il lavoro pesante** (`api/backup.rs`, `backup.rs`, `backup_schedule.rs`). Il database ha una sola connessione. Oggi backup e ripristino la tengono mentre comprimono, decomprimono e ricodificano le copertine. Regola:
   - **Ripristino.** Decompressione, validazione e ricodifica delle copertine avvengono in `tokio::task::spawn_blocking`, senza connessione. Dentro `db.run` restano solo la transazione e lo spostamento dei file già pronti. `restore_archive` non riceve più i byte dell'archivio: riceve il risultato dell'analisi.
   - **Backup.** Dentro `db.run` si leggono solo le righe. Lettura delle copertine da disco e compressione avvengono fuori, in `spawn_blocking`. Una copertina che non si riesce a leggere viene omessa, e nell'archivio quel libro risulta senza copertina (`cover_file` e `cover_color` nulli): l'archivio resta coerente.
   - Vale anche per il backup programmato.
   - Il formato dell'archivio non cambia: un archivio creato prima di questa task si ripristina ancora.

## Test

- `tests/backup_schedule.rs`:
  - `a_future_dated_backup_does_not_make_backups_due_forever`: file automatico datato `now + 10 giorni` già presente; primo giro → crea un backup; secondo giro dentro l'intervallo → non ne crea.
  - `rotation_ignores_future_dated_backups`: con `keep = 1` e un file futuro presente, dopo due backup veri restano il file futuro e il più recente dei veri.
- `tests/backup_api.rs`:
  - `restore_rejects_authors_that_are_not_a_json_list`: archivio valido in cui un libro ha `authors_json` uguale a `"non json"` → 400 `invalid_archive`; i libri di prima ci sono ancora. Stesso esito con `{"a":1}` e con `[1,2]`.
  - `backup_omits_a_cover_that_cannot_be_read`: libro con copertina, file cancellato da disco a mano; `POST /backup` → 200; dopo il ripristino dell'archivio quel libro non ha copertina e `GET /books/{id}/cover` risponde 404 `cover_not_found`.
  - `archives_made_before_this_change_still_restore`: usa un archivio costruito nel test con la stessa struttura di oggi.
- Nessun test misura tempi o dipende da attese.

## Acceptance criteria

- `cargo test -p bookeeper-core --test backup_api --test backup_schedule` passa, test nuovi e vecchi.
- In `api/backup.rs` e `backup_schedule.rs` nessuna chiusura passata a `db.run` chiama funzioni che comprimono, decomprimono o decodificano immagini.
- La funzione che analizza l'archivio non riceve una connessione.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
- Cambiano solo: `backup.rs`, `backup_schedule.rs`, `api/backup.rs`, `tests/backup_api.rs`, `tests/backup_schedule.rs` (tutti sotto `crates/bookeeper-core/`).
