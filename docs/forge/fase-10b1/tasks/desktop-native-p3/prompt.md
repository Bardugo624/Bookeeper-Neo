Leggi prima `docs/forge/fase-10b1/CONTRATTO.md`.

# Computer: la cache del lettore e il test della copertina

## File
`apps/desktop/src-tauri/src/reader.rs`, `apps/desktop/src-tauri/tests/reader.rs` e `apps/desktop/src-tauri/tests/local_session.rs`.

## Cosa fare
- **File a metà:** la pulizia della cache toglie anche i file nascosti lasciati da una copia interrotta (`.<uuid>.part`, `.bookeeper-*.tmp`), se sono più vecchi di un'ora.
- **Lo stesso libro due volte insieme:** la seconda richiesta aspetta la prima e usa il suo file, invece di scaricarlo di nuovo e rinominarlo sopra.
- **Il test della copertina** in `local_session.rs` controlla 200 e un JPEG, non solo «diverso da 401»; il commento dice quello che il test prova.

## Test
- `stale_partial_files_are_cleaned`.
- `two_requests_for_the_same_book_download_once`.
- Il test della copertina, aggiornato.

## Acceptance criteria
- `cargo test -p bookeeper-desktop --test reader --test local_session` e `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` passano.
- `cargo fmt --all -- --check` passa.
