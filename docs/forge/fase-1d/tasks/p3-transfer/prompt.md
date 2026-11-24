Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Import e lettura del corpo: tre difetti rimasti dal run 1C

## Obiettivo

Chiudere tre difetti P3. Ogni correzione ha il suo test.

## Correzioni

1. **`read_body` risponde sempre 413** (`api/util.rs`). Oggi ogni errore di lettura diventa `payload_too_large`. Regola: solo il superamento del limite dà 413 `payload_too_large`. Ogni altro errore di lettura (flusso interrotto, pezzo malformato) dà 400 `bad_request`. Per distinguere, guarda la catena `source()` dell'errore: il limite è `http_body_util::LengthLimitError` (`http-body-util` è già tra le dipendenze del core).

2. **Riconoscimento di LibraryThing** (`import.rs`, `detect`). Oggi è più stretto del Go (`server/internal/api/importexport.go`, `detectImportFormat`, sola lettura). Regola, nell'ordine:
   1. Goodreads: come oggi.
   2. L'intestazione è separata da tabulazioni e contiene `primary author` **oppure** `title` → LibraryThing.
   3. Calibre: come oggi.
   4. L'intestazione è separata da tabulazioni → LibraryThing.
   5. Altrimenti formato sconosciuto.
   "Separata da tabulazioni" significa: la prima riga contiene almeno una tabulazione. Le intestazioni di LibraryThing possono essere tra apici singoli (`'TITLE'`): la normalizzazione esistente li toglie già; verificalo.

3. **Doppioni dentro lo stesso file** (`api/transfer.rs`, ciclo di import). Oggi una riga contribuisce a `known` con una sola chiave ISBN, mentre i libri della libreria contribuiscono con entrambe. Regola: una riga è un doppione se il suo `isbn_13` **o** il suo `isbn_10` è in `known`. Una riga accettata inserisce in `known` entrambe le sue chiavi. Così due righe dello stesso libro, una con solo ISBN-13 e una con ISBN-13 e ISBN-10, contano come un libro e un doppione, in qualunque ordine. Una riga senza ISBN non è mai un doppione, come oggi.

## Test

- Test unitari in `api/util.rs` (`#[cfg(test)]`): `a_body_over_the_limit_is_413`; `a_broken_body_is_400` (corpo costruito con `axum::body::Body::from_stream` su un flusso che dà un pezzo e poi un errore; `futures-util` è tra le dipendenze di sviluppo).
- `tests/transfer_api.rs`:
  - `librarything_is_detected_with_only_a_title_column` (intestazione con tabulazioni: `'TITLE'`, `'ISBN'`, senza `PRIMARY AUTHOR`);
  - `any_tab_separated_header_falls_back_to_librarything`;
  - `goodreads_and_calibre_detection_is_unchanged` (un file per formato tra quelli già in `tests/fixtures/import`);
  - `in_file_duplicates_match_on_either_isbn` (i due ordini del punto 3: in entrambi `new == 1`, `duplicates == 1`);
  - `rows_without_isbn_are_never_duplicates`.
- I file di esempio nuovi vanno sotto `tests/fixtures/import`.

## Acceptance criteria

- `cargo test -p bookeeper-core --lib api::util` e `cargo test -p bookeeper-core --test transfer_api --test covers_api --test backup_api` passano (covers e backup usano `read_body`).
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
- Cambiano solo: `api/util.rs`, `import.rs`, `api/transfer.rs`, `tests/transfer_api.rs`, file sotto `tests/fixtures/import` (tutti sotto `crates/bookeeper-core/`).
