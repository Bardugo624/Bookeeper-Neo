Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Backup e ripristino della libreria

## Obiettivo

Un archivio che contiene tutta una libreria, copertine incluse, e il suo ripristino. Logica in `crates/bookeeper-core/src/backup.rs`, rotte `POST /backup` e `POST /restore` in `api/backup.rs`. Le rotte `/backups` (elenco e configurazione) sono di un'altra task.

## Archivio

Zip con:
- `manifest.json`: `{ "format": "bookeeper-backup", "format_version": 1, "app_version", "created_at", "library": {id, name}, "counts": {books, shelves, loans, wishlist, …} }`;
- `data.json`: un oggetto con una lista di righe per ogni tabella di dominio della libreria: `rooms`, `shelves`, `books`, `shelf_books`, `loans`, `wishlist`, `reading`, `tags`, `book_tags`, più `users` ridotti a `{id, display_name, role}` (mai email né hash della password);
- `covers/<file>` per ogni libro con copertina.

Restano fuori: dispositivi, token, codici, `audit_log`, `server_meta`, password.

```rust
pub fn create_archive(conn: &rusqlite::Connection, files: &Files, library_id: &str, now: i64) -> Result<Vec<u8>, BackupError>;
pub fn restore_archive(conn: &mut rusqlite::Connection, files: &Files, who: &AuthUser, bytes: &[u8], now: i64) -> Result<RestoreReport, BackupError>;
```

`create_archive` legge i dati in una transazione di sola lettura, così l'archivio è coerente anche con scritture in corso.

## Rotte

- `POST /backup` (`admin` o superiore): risponde con l'archivio (`util::download`, nome `bookeeper-<libreria>-<AAAAMMGG-HHMMSS>.zip`); audit `library.backup`.
- `POST /restore` (solo `owner`, con `confirm::Confirmed`): corpo = archivio, al più 200 MB (`util::read_body`). Risposta `RestoreReport { books, shelves, loans, wishlist, covers, users_remapped }`; audit `library.restore`.

## Regole del ripristino

- **Sostituisce** i dati della libreria di chi chiede con quelli dell'archivio, in **una** transazione: o tutto o niente. Gli utenti e i dispositivi attuali restano.
- L'archivio può venire da un'altra libreria: ogni `library_id` viene riscritto con quello attuale. Gli identificativi delle altre righe restano, ma se un id esiste già in **un'altra** libreria dello stesso server viene rigenerato, con tutti i riferimenti aggiornati.
- I riferimenti a utenti (`wishlist.user_id`, `reading.user_id`, `books.owner_user_id`, `loans.borrower_user_id`): se l'utente esiste nella libreria attuale resta; altrimenti le righe di `wishlist` e `reading` passano a chi ripristina, e i due riferimenti facoltativi diventano `NULL`. `users_remapped` conta gli utenti sostituiti.
- L'indice `books_fts` viene ricostruito per i libri ripristinati, e pulito da quelli tolti.
- Le copertine: i file dell'archivio sostituiscono quelli attuali; i file di libri non più presenti vengono cancellati. I file si scrivono dopo il commit, in una cartella temporanea e poi rinominati; un guasto qui non annulla i dati ma è riportato nel registro.
- **Archivio ostile.** Rifiuta con 400 `invalid_archive`: zip illeggibile; manifest assente, di formato o versione sconosciuti; voci con percorso assoluto, con `..` o fuori da `covers/`; più di 100.000 voci; dimensione decompressa totale oltre 1 GB o singola voce oltre 20 MB (controllata mentre si decomprime, non dall'intestazione); `data.json` con tabelle o colonne sconosciute. I nomi dei file delle copertine si ricavano dall'id del libro, mai dal nome nella voce. Ogni copertina ripassa per `covers::process`.
- Un archivio rifiutato non cambia nulla.

## Test (`crates/bookeeper-core/tests/backup_api.rs`)

Usa `mod common;`. Gli archivi ostili si costruiscono nel test con `zip`.

- `backup_contains_manifest_data_and_covers`; `backup_never_contains_secrets` (nessuna email, hash, token, `server_meta` nei byte decompressi).
- `backup_then_restore_round_trips`: libri, scaffali con collocazioni, prestiti, wishlist, tag e copertine tornano uguali.
- `restore_replaces_existing_data`: un libro creato dopo il backup sparisce.
- `restored_books_are_searchable_and_removed_ones_are_not`.
- `restore_into_another_library_rewrites_ownership`: archivio della libreria A ripristinato nella B dello stesso server: A resta intatta, B ha i dati, nessun conflitto di id.
- `unknown_users_are_remapped_to_the_restorer`.
- `restore_is_atomic`: un archivio con una riga che viola un vincolo → errore, e i dati di prima ci sono tutti.
- `hostile_archives_are_rejected`: ognuno dei casi elencati sopra → 400 `invalid_archive`, nulla cambia, nessun file scritto fuori da `covers_dir`.
- `restore_needs_owner_and_confirmation`: `admin` → 403; `owner` senza `X-Confirm-Token` → 401 `confirmation_required`.
- `backup_needs_admin`; `routes_need_a_token`; `backup_and_restore_are_audited`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test backup_api` passa con tutti i test elencati.
- Cambiano solo `backup.rs`, `api/backup.rs`, `tests/backup_api.rs`.
- Le due rotte compaiono in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
