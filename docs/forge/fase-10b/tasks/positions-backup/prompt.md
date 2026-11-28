Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`. La task `annotations-api` è già unita.

# Core: il tipo di dispositivo e le note nei backup

## File
- `crates/bookeeper-core/src/api/positions.rs` e `crates/bookeeper-core/tests/positions.rs`.
- `crates/bookeeper-core/src/backup.rs` e `crates/bookeeper-core/tests/backup.rs`.
- `crates/bookeeper-core/src/openapi.rs` se serve, e `packages/api` (rigenerato).

## Regole
- `PositionOut` riceve `device_kind`: `desktop`, `mobile`, o `null` se il dispositivo non c'è più.
- `annotations` entra in `TABLES` di `backup.rs`, e il ripristino la cancella e la riscrive come `reading_positions`.

## Passi
- [ ] Test, prima del codice:
  - `positions_name_the_device_kind`;
  - `a_removed_device_has_no_kind`;
  - `backup_round_trips_annotations`, cancellate comprese;
  - `restore_replaces_the_annotations`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino, aggiorna OpenAPI e `packages/api`.

## Acceptance criteria
- `cargo test -p bookeeper-core`, `cargo clippy -p bookeeper-core -- -D warnings` e `npm test -w @bookeeper/api` passano.
- `cargo fmt --all -- --check` passa.
