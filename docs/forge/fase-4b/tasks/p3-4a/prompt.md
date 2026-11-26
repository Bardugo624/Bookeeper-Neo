Leggi prima `docs/forge/fase-4a/CONTRATTO.md` e i contratti della fase 1 che cita. Ogni correzione ha un test che fallisce prima e passa dopo. Questa è l'unica task del run 4B che tocca il core.

# Core: quattro difetti P3 del run 4A

1. **`crates/bookeeper-core/src/api/reading.rs:179`** — con `status: "reading"`, un `finished_at` e nessun `started_at`, `started_at` diventa adesso, quindi dopo `finished_at`: la riga salvata viola la regola `finished_at >= started_at`. Il controllo avviene prima dei valori predefiniti. Regola: prima si completano i valori predefiniti, poi si convalida; in quel caso la risposta è 422.
2. **`src/api/books_search.rs:189`** e `facets.rs` — il confronto senza maiuscole di `genre` e `language` piega solo le lettere ASCII: `genre=ética` non trova "Ética", e le faccette elencano "Ética" e "ética" separate. Regola: confronto e raggruppamento con minuscole Unicode. Registra una funzione SQLite con `rusqlite` (per esempio `ulower`) al momento dell'apertura della connessione, in `src/db/mod.rs`, e usala nelle query; nessuna dipendenza nuova.
3. **`src/api/audit.rs:126`** — un filtro vuoto (`?action=`) è trattato come valore e non restituisce nulla. Regola: un valore vuoto vale come filtro assente, per `action`, `user_id`, `device_id`, `entity_type`.
4. **`src/api/audit.rs:95`** — `detail` esce con qualunque tipo JSON, mentre lo schema dice oggetto. Regola: se `detail_json` non è un oggetto JSON, `detail` è `null`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test reading_api --test books_search_api --test facets_api --test audit_api --test db` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- Cambiano solo: `crates/bookeeper-core/src/api/reading.rs`, `api/books_search.rs`, `api/books.rs`, `api/facets.rs`, `api/audit.rs`, `src/db/mod.rs`, e i test `reading_api.rs`, `books_search_api.rs`, `facets_api.rs`, `audit_api.rs`, `db.rs`.
