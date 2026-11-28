Leggi prima `docs/forge/fase-10a1/CONTRATTO.md` e `docs/forge/fase-10a/CONTRATTO.md`.

# Core: i problemi noti della 10A

## File
- `crates/bookeeper-core/src/api/`: `book_files.rs`, `reading.rs`, `ebook_files.rs` e `openapi.rs`.
- I test in `crates/bookeeper-core/tests/`: `ebook_api.rs`, `reading.rs`, `plumbing.rs` e `openapi.rs`.
- `packages/api`: OpenAPI e client generato.
- `apps/desktop/src/modules/books/BooksPage.test.tsx` e `apps/mobile/src/modules/reading/ReadingBadge.test.tsx` costruiscono un `ReadingSummary`. Il campo nuovo è obbligatorio: aggiungilo con `null`.

## Cosa fare
1. **Un file appena ricaricato non sparisce.**
   - Oggi, se A stacca l'ultimo libro da un file mentre B lo ha appena ricaricato per attaccarlo, `remove_unused` cancella il file e l'attacco di B risponde 404.
   - Togliendo un file da un libro, il file su disco si cancella solo se nessuna riga lo usa e se è più vecchio del tempo di grazia. Altrimenti lo toglie la pulizia oraria.
   - Test in `ebook_api.rs`.
2. **«Da leggere» azzera l'avanzamento.**
   - Oggi, su un libro senza `page_count`, tornare a `to_read` lascia `progress_percent`.
   - Quando lo stato diventa `to_read`, i tre campi dell'avanzamento diventano `NULL`, con o senza pagine.
   - Test in `reading.rs`.
3. **L'anello della copertina.**
   - `ReadingSummary` riceve `progress_percent`.
   - Test in `reading.rs`: la lista dei libri lo riporta dopo una posizione salvata.
4. **Il test della pulizia aspetta davvero.**
   - `maybe_sweep` restituisce un modo per aspettare la fine della pulizia che avvia, per esempio un `JoinHandle` o un `oneshot`. Il router lo ignora.
   - `the_router_sweeps_at_startup_but_only_once_an_hour` aspetta quel segnale prima di invecchiare il file.
5. **`run_does_not_block_the_runtime` non dipende dal carico.**
   - Oggi chiede che tutto finisca entro 400 ms.
   - Deve verificare che il lavoro breve finisca prima di quello lungo. Un limite di tempo, se resta, è di almeno 5 s.
6. **Rigenera `packages/api`** con il comando del contratto della 10A.

## Acceptance criteria
- `cargo test -p bookeeper-core`, `cargo clippy -p bookeeper-core --all-targets -- -D warnings` e `cargo fmt --all -- --check` passano.
- `npm test -w @bookeeper/api` e `npm run typecheck` alla radice passano.
- `for i in $(seq 10); do cargo test -q -p bookeeper-core --test ebook_api --test plumbing -- --test-threads=32 || exit 1; done` passa.
