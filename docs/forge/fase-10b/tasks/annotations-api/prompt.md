Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Core: note, evidenziazioni e segnalibri

## File
- Crea `crates/bookeeper-core/src/db/migrations/0006_annotations.sql` e aggiungila a `MIGRATIONS` in `src/db/mod.rs`.
- Crea `crates/bookeeper-core/src/api/annotations.rs`, con `routes()` e `Doc` come `positions.rs`. Registralo in `api/mod.rs` e in `openapi.rs`.
- **Test:**
  - `tests/annotations.rs`, nuovo;
  - la versione dello schema in `tests/db.rs` (oggi 5, in tre punti);
  - se serve, `tests/openapi_errors.rs`.
- **`packages/api`:** rigenera, poi crea `resources/positions.ts` e `resources/annotations.ts`. Aggiungile a `createClient` ed esporta i tipi da `index.ts`.

## Regole
Quelle della sezione «API» del contratto, tranne `device_kind` e il backup, che fa `positions-backup`.

## Passi
- [ ] Test, prima del codice:
  - `a_highlight_is_created_and_listed`;
  - `an_older_write_does_not_overwrite_a_newer_one`: stesso id, `updated_at` minore, risponde la riga salvata invariata;
  - `deleting_leaves_a_tombstone_for_since`: sparisce dalla lista senza `since`; con `since` torna con `deleted_at`;
  - `another_person_cannot_see_or_touch_an_annotation`: non la vede, e un PUT con lo stesso id risponde 404;
  - `a_highlight_needs_a_color_and_a_bookmark_has_none`: 422;
  - `limits_are_enforced`: `cfi` di 4001 caratteri, `percent` 101, `updated_at` fra 10 minuti, tutti 422;
  - `the_file_must_belong_to_the_book`: lo sha256 di un altro libro risponde 404;
  - `guests_get_403`;
  - `deleting_the_book_deletes_its_annotations`;
  - in `packages/api`, con un transport finto come `resources.test.ts`: `listAnnotations` passa `since` nella query; `putAnnotation`, `listPositions` e `putPosition` usano metodo e percorso giusti.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino, aggiorna OpenAPI e `packages/api`.

## Acceptance criteria
- Passano `cargo test -p bookeeper-core`, `cargo clippy -p bookeeper-core -- -D warnings`, `npm test -w @bookeeper/api` e `npm run typecheck -w @bookeeper/api`.
- `cargo fmt --all -- --check` passa.
