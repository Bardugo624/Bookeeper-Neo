Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Import ed export

## Obiettivo

`POST /api/v1/import` e `GET /api/v1/export`. Parser in `crates/bookeeper-core/src/import.rs`, rotte in `api/transfer.rs`. Riferimento per la parità: `server/internal/api/importexport.go` (sola lettura): porta in Rust le stesse mappature di colonne e di formati.

## Import

Corpo `{ "format": "auto"|"goodreads"|"calibre"|"librarything", "content": string, "dry_run": bool }`. Solo `admin` o superiore. Il corpo può arrivare a 10 MB: alza il limite solo su questa rotta (`DefaultBodyLimit`).

Risposta `ImportReport`:

```
{ "format", "total", "new", "duplicates", "invalid", "preview": [ImportedBook; al più 20], "errors": [ { "row", "message" }; al più 50 ] }
```

- **Formati.** Goodreads: CSV con intestazioni come `Title`, `Author`, `Additional Authors`, `ISBN`, `ISBN13`, `Publisher`, `Number of Pages`, `Year Published`, `Binding`. Calibre: CSV da catalogo (`title`, `authors` separati da ` & `, `isbn`, `publisher`, `pubdate`, `languages`). LibraryThing: TSV (`TITLE`, `PRIMARY AUTHOR`, `SECONDARY AUTHOR`, `ISBNS`, `PUBLICATION`, `DATE`, `PAGE COUNT`, `LANGUAGES`). `auto` riconosce il formato dalle intestazioni; se non lo riconosce → 422 `validation`.
- Goodreads scrive gli ISBN come `="9780306406157"`: togli `=` e virgolette. Tollera il BOM UTF-8, i ritorni a capo `\r\n`, le virgolette raddoppiate e i campi con ritorni a capo interni.
- **Normalizzazione.** ISBN controllati con `util::normalize_isbn13` / `normalize_isbn10`: uno non valido viene scartato senza scartare la riga. `Binding` → `format` con la stessa tabella di `mapBinding`. Ogni riga passa per `books::validate_new`: una riga che non la supera conta in `invalid` con il suo errore e non blocca le altre.
- **Duplicati.** Per ISBN (13, oppure 10 se manca il 13), contro i libri già nella libreria e contro le righe precedenti dello stesso file. Le righe senza ISBN sono sempre nuove.
- **Scrittura.** Con `dry_run: true` non scrive nulla. Altrimenti inserisce tutte le righe nuove in **una** transazione e scrive **una sola** riga di audit, `library.import`, con `detail` `{format, new, duplicates, invalid}`. Le singole `book.create` non vanno scritte: in `api/books.rs` aggiungi `pub fn insert_in_tx_unaudited(tx, library_id: &str, book: &NewBook, now) -> rusqlite::Result<Result<String, ApiError>>` che fa ciò che fa `insert_in_tx` (riga del libro e riga full-text) senza l'audit, e fai sì che `insert_in_tx` la riusi. Nessun altro cambio a `books.rs`.
- Al più 20.000 righe: oltre → 422 `validation`.

## Export

`GET /export?format=json|csv` (`member` o superiore) → file da scaricare (`util::download`), nome `bookeeper-<nome libreria>-<AAAAMMGG>.<ext>`.
- `json`: `{ "exported_at", "library": {id, name}, "books": [BookOut senza `placement` né `on_loan`, più `shelf_name`, `row_index`, `slot_index`] }`.
- `csv`: una riga per libro, intestazioni `title,subtitle,authors,isbn_13,isbn_10,publisher,published_year,language,page_count,genre,format,progressive_number,condition,acquired_at,price_cents,notes,shelf,row,slot`; autori separati da `; `. Le celle che iniziano con `=`, `+`, `-`, `@` sono precedute da un apostrofo, perché un foglio di calcolo non le esegua come formule.

## Test (`crates/bookeeper-core/tests/transfer_api.rs`)

File di prova in `tests/fixtures/import/` (`goodreads.csv`, `calibre.csv`, `librarything.tsv`), scritti a mano con 4–6 righe ciascuno, compresi i casi difficili.

- `goodreads_is_parsed`; `calibre_is_parsed`; `librarything_is_parsed`: titoli, autori, ISBN, anno, pagine, formato giusti.
- `auto_detects_each_format`; `unknown_headers_are_validation`.
- `goodreads_isbn_wrappers_are_removed`; `bom_crlf_and_quoted_newlines_are_tolerated`.
- `dry_run_writes_nothing`: il rapporto è uguale a quello dell'import vero, e i libri restano zero.
- `import_inserts_new_books_and_they_are_searchable` (`books_fts` li trova).
- `duplicates_against_the_library_and_within_the_file`.
- `rows_without_isbn_are_always_new`; `invalid_rows_are_reported_and_skipped`; `invalid_isbn_is_dropped_but_the_row_is_kept`.
- `more_than_20000_rows_is_validation`.
- `imported_books_leave_no_per_book_audit_rows`: dopo un import di tre libri `audit_rows` contiene una sola riga, `library.import`.
- `import_needs_admin`: `member` → 403; `guest` → 403.
- `import_is_audited_once`.
- `export_json_contains_every_book_with_its_shelf`; `export_csv_has_the_header_and_escapes_formulas` (titolo `=1+1` → `'=1+1`); `export_filename_is_sanitised`; `export_never_contains_another_library`; `guest_cannot_export`; `routes_need_a_token`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test transfer_api` passa con tutti i test elencati.
- Cambiano solo `import.rs`, `api/transfer.rs`, `tests/transfer_api.rs`, i file sotto `tests/fixtures/import/` e `api/books.rs` (la sola funzione indicata).
- `cargo test -p bookeeper-core --test books_api --test wishlist_api` passa ancora.
- Le due rotte compaiono in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
