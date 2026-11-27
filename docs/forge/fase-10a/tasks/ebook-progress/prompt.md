Leggi prima `docs/forge/fase-10a/CONTRATTO.md`, che fissa valori, interfacce e regole, e la parte «Fase 10A» del design `docs/superpowers/specs/2026-11-27-ebook-design.md`. Le task `ebook-core` ed `ebook-api` sono già unite.

# Core: un solo progresso per persona e per libro

## File
- Modifica `crates/bookeeper-core/src/api/reading.rs`.
- Crea `crates/bookeeper-core/src/api/positions.rs` e registralo.
- Aggiorna `packages/api`.
- Scrivi i test in `crates/bookeeper-core/tests/positions.rs` e aggiorna quelli della lettura.
- I due campi nuovi di `ReadingOut` sono obbligatori. Dove le app costruiscono un `ReadingOut` mettili a `null`: `optimisticReading` in `readingModel.ts` e l'helper in `testkit.tsx`, sia in `apps/desktop/src/modules/reading/` sia in `apps/mobile/src/modules/reading/`, e `apps/desktop/src/modules/stats/YearDialog.test.tsx`.

## Regole
- `ReadingOut` riceve `progress_percent` e `progress_at`.
- **Pagina scritta a mano:** se il libro ha `page_count`, si ricava `progress_percent = current_page / page_count × 100`, arrotondato a una cifra decimale, con `progress_at` all'ora attuale.
- **`PUT …/position`:**
  - salva o aggiorna `reading_positions` per persona, file e `kind`;
  - aggiorna la lettura della persona: `progress_percent`, `progress_at` e `progress_device_id` (il dispositivo della sessione);
  - se il libro ha `page_count`, aggiorna anche `current_page = round(percent / 100 × page_count)`;
  - se la lettura non esiste e `percent > 0`, la crea con stato `reading` e `started_at` all'ora attuale;
  - non cambia mai lo stato in `read`: lo fa la persona.
- **`GET …/positions`:** le posizioni della persona sui file del libro, con il nome del dispositivo.
- Vince l'ultima scrittura. Il server non decide nient'altro: il lettore confronta e chiede.

## Passi
- [ ] Test, prima del codice:
  - la pagina scritta a mano dà la percentuale;
  - una posizione al 37,5% dà `progress_percent` 37,5 e `current_page` 150 su 400 pagine;
  - una posizione senza lettura esistente la crea con stato `reading`;
  - una posizione al 100% non segna `read`;
  - `GET` restituisce le posizioni con il nome del dispositivo;
  - le posizioni di un'altra persona non si vedono;
  - `guest` → 403.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino e aggiorna OpenAPI e `packages/api`.

## Acceptance criteria
- `cargo test -p bookeeper-core`, `cargo clippy -p bookeeper-core -- -D warnings` e `npm test -w @bookeeper/api` passano.
- `npm run typecheck` passa alla radice: i tipi nuovi non rompono le app.
- `cargo fmt --all -- --check` passa.
