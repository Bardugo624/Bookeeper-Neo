Leggi prima `docs/forge/fase-7b/CONTRATTO.md`, `docs/forge/fase-7b/AUDIT.md`, `PRODUCT.md` e `DESIGN.md`.

# Difetti P3 rimasti dal run 7A, e un test instabile

1. **Percorso dei file di prova nei test Rust**: `crates/bookeeper-core/tests/lookup_annas.rs`, `lookup_openlibrary.rs`, `lookup_google.rs`, `openapi.rs` e `apps/desktop/src-tauri/tests/connections.rs` ricavano i percorsi con `env!("CARGO_MANIFEST_DIR")`, fissato alla compilazione. Un binario di test riusato da un'altra cartella di lavoro cerca i file nella cartella sbagliata. Regola: si usa la variabile d'ambiente di quando il test gira (`std::env::var("CARGO_MANIFEST_DIR")`, che `cargo test` imposta), con un messaggio chiaro se manca.
2. **Commento superato**: `crates/bookeeper-core/src/lookup/annas.rs:3` cita `server/internal/annas/annas.go`, che non esiste più. Il commento dice da dove viene il comportamento senza citare file eliminati.
3. **Piani di query**: `crates/bookeeper-core/tests/perf_10k.rs` (circa riga 216) non verifica con `EXPLAIN QUERY PLAN` le query di `GET /stats` (conteggi per colonna, decenni, mesi, prestiti per mese, autori con `json_each`) né quelle di `/stats/reading`. Aggiungile con la stessa regola delle altre; se una non usa un indice dove filtra per libreria, segnalalo nel rapporto senza cambiare il codice di produzione.
4. **Test instabile della PWA** (accettato nel run 7A con questa correzione): `apps/mobile/src/modules/search/ResultList.windowing.test.tsx`, circa riga 142, test "measures again when the watched row is resized, as when the text grows". Dopo `scrollTo(30000)` lo scorrimento è gestito al fotogramma successivo; l'attesa che precede è già vera per la posizione vecchia. Regola: si attende con `findByRole` la riga che compare solo dopo il nuovo scorrimento. Il file passa da solo, cinque volte di fila.

## Acceptance criteria

- `cargo fmt --check` e `cargo clippy --workspace --all-targets -- -D warnings` passano.
- `cargo test -p bookeeper-core` e `cargo test -p bookeeper-desktop` passano.
- `npx vitest run src/modules/search/ResultList.windowing.test.tsx` dentro `apps/mobile` passa cinque volte di fila; `npm test -w @bookeeper/mobile` passa.
- Cambiano solo i file nominati qui sopra.
