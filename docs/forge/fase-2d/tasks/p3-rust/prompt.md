Leggi prima `docs/forge/fase-2d/CONTRATTO.md` e i contratti che cita: regole, nomi e aspetto valgono anche qui. Ogni correzione ha un test che fallisce prima e passa dopo.

# Guscio: tre difetti P3 del salvataggio file

1. **`apps/desktop/src-tauri/src/files.rs:66`** — troncando un nome lungo può ricomparire `..`: il taglio cade subito dopo un punto e poi si aggiunge il punto dell'estensione. Regola: dopo il troncamento il nome non contiene mai `..`, non finisce con un punto o uno spazio, e l'estensione resta; la pulizia è idempotente.
2. **`files.rs:24`** — `SaveOutcome.path` è `Option<String>` senza `skip_serializing_if`: annullando arriva `path: null`, mentre il contratto e il tipo TypeScript dicono campo assente. Regola: `None` non viene serializzato.
3. **`apps/desktop/src-tauri/src/lib.rs:116`** — la finestra di salvataggio è costruita senza `set_parent`: non è modale rispetto alla finestra dell'app e l'utente può avviare un secondo salvataggio. Regola: la finestra ha come genitore la finestra principale; una seconda richiesta mentre una è aperta risponde subito `{ saved: false }` (un solo salvataggio alla volta, con una guardia provabile senza Tauri).

## Test

In `apps/desktop/src-tauri/tests/files.rs`: nomi che dopo il troncamento produrrebbero `..`, punto finale, spazio finale; idempotenza su venti nomi; JSON dell'esito annullato senza chiave `path`; guardia: seconda acquisizione rifiutata, rilasciata alla fine anche in caso d'errore.

## Acceptance criteria

- `cargo test -p bookeeper-desktop --test files` e `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` passano.
- Cambiano solo: `apps/desktop/src-tauri/src/files.rs`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/tests/files.rs`.
