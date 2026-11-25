Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Ogni correzione ha un test che fallisce prima e passa dopo.

# Guscio: due difetti P3 nelle connessioni

File: `apps/desktop/src-tauri/src/connections.rs`.

1. **Id normalizzato solo in `upsert`** (riga 191 circa): `normalize` riscrive l'id in minuscolo con trattini, ma `activate` e `remove` confrontano la stringa ricevuta. Regola: `activate` e `remove` normalizzano l'id allo stesso modo prima di confrontare; un id che non è un UUID è un errore in entrambe.
2. **Nome del file corrotto al secondo** (riga 143 circa): due file corrotti messi da parte nello stesso secondo si sovrascrivono. Regola: il nome è unico; se `connections.json.corrotto-<unix>` esiste già si aggiunge un contatore (`-1`, `-2`, …). Nessun file messo da parte viene mai sovrascritto.

## Test

In `apps/desktop/src-tauri/tests/connections.rs`:

- `activate_accepts_any_spelling_of_the_id`: maiuscolo e tra parentesi graffe.
- `remove_accepts_any_spelling_of_the_id`.
- `activate_and_remove_refuse_a_non_uuid`.
- `two_corrupt_files_in_one_second_are_both_kept`.

## Acceptance criteria

- `cargo test -p bookeeper-desktop --test connections` passa.
- `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` passa.
- Cambiano solo: `apps/desktop/src-tauri/src/connections.rs`, `apps/desktop/src-tauri/tests/connections.rs`.
