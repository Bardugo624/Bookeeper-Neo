Leggi prima `docs/forge/fase-5a1/CONTRATTO.md` e la sezione API di `docs/forge/fase-5a/CONTRATTO.md`. Leggi `crates/bookeeper-core/src/api/shelves.rs` (`place_book`) e `crates/bookeeper-core/tests/shelves_api.rs`.

# Core: due difetti P3 della collocazione

1. **Descrizioni OpenAPI superate** (`place_book`): il 409 `row_full` descrive solo lo scorrimento senza posti a destra; manca il caso nuovo (aggiunta in coda a un ripiano il cui ultimo posto è occupato). Il 422 non cita `shift` senza `slot_index`. Aggiorna i due testi e rigenera `packages/api/openapi.json` e `packages/api/src/schema.d.ts` con i comandi del repository.
2. **`spine_width` scartato**: senza `slot_index`, se il libro è già sul ripiano, l'uscita anticipata ignora un `spine_width` presente nella richiesta. Regola del contratto 5A1: la posizione resta, la larghezza si applica (valore o `null`), nella stessa transazione; la riga di audit si scrive solo se qualcosa è cambiato. Test: libro già sul ripiano con `spine_width: 3` → larghezza 3, stessa posizione; con `null` → nessuna larghezza; senza il campo → nulla cambia e nessuna riga di audit.

## Acceptance criteria

- `cargo test -p bookeeper-core --test shelves_api` e il test che confronta `openapi.json` con la specifica generata passano.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa. Il codice è formattato con `rustfmt`.
- `npm test -w @bookeeper/api` passa.
- Cambiano solo: `crates/bookeeper-core/src/api/shelves.rs`, `crates/bookeeper-core/tests/shelves_api.rs`, `packages/api/openapi.json`, `packages/api/src/schema.d.ts`.
