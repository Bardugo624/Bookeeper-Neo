Leggi prima `docs/forge/fase-5a/CONTRATTO.md` (sezione API) e `docs/forge/fase-4a/CONTRATTO.md`. Leggi `crates/bookeeper-core/src/api/shelves.rs` per intero e `crates/bookeeper-core/tests/shelves_api.rs`.

# Core: collocare nel posto successivo

## Cosa fare

1. `PlaceIn.slot_index` diventa `Option<i64>`, con le regole del contratto. La scelta del posto e la scrittura stanno nella stessa transazione: due richieste concorrenti sullo stesso ripiano non ricevono mai lo stesso posto (la seconda vede il posto della prima, oppure riceve `row_full`; mai un 500).
2. Errore nuovo `row_full` (409), documentato nell'OpenAPI della rotta come gli altri.
3. Rigenera `packages/api/openapi.json` e `packages/api/src/schema.d.ts` con i comandi che il repository già usa. Adegua `packages/api/src/resources/shelves.ts` e i suoi test solo se il tipo generato lo richiede.

## Test (`crates/bookeeper-core/tests/shelves_api.rs`)

- Ripiano vuoto → posto 0. Ripiano con libri ai posti 0, 1, 4 → posto 5.
- Libro già su quel ripiano → resta dov'è, stessa posizione nella risposta, nessuna riga di audit in più.
- Libro su un altro ripiano o mobile → si sposta in coda al nuovo.
- Ultimo posto occupato → `409 row_full`, nulla cambia.
- `shift: true` senza `slot_index` → errore di validazione.
- Con `slot_index` → comportamento di prima (i test esistenti restano verdi senza modifiche).
- Dieci richieste concorrenti per dieci libri sullo stesso ripiano da dieci posti → dieci posti diversi.
- Isolamento tra librerie: mobile di un'altra libreria → 404.

## Acceptance criteria

- `cargo fmt --check` passa.
- `cargo test -p bookeeper-core` passa, compreso il test che confronta `openapi.json` con la specifica generata.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- `npm test -w @bookeeper/api` e `npm run typecheck -w @bookeeper/api` passano.
- `npm run typecheck -w @bookeeper/desktop` e `npm run typecheck -w @bookeeper/mobile` passano. Se il campo ora facoltativo rompe un tipo in un'app, fermati e dillo: non toccare le app.
- Cambiano solo: `crates/bookeeper-core/src/api/shelves.rs`, `crates/bookeeper-core/src/api/error.rs` o il file dove vivono i codici d'errore, `crates/bookeeper-core/tests/shelves_api.rs`, `packages/api/openapi.json`, `packages/api/src/schema.d.ts`, `packages/api/src/resources/shelves.ts`, `packages/api/src/resources.test.ts`.
