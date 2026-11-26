Leggi prima `docs/forge/fase-4a/CONTRATTO.md` e i contratti della fase 1 che cita. Leggi `crates/bookeeper-core/src/db/migrations/0001_schema.sql`, `src/db/mod.rs`, `src/api/mod.rs`, `src/openapi.rs`, `src/auth/guard.rs` e un modulo di rotte esistente con i suoi test (`src/api/wishlist.rs`, `tests/wishlist_api.rs`) per forma, errori, audit e isolamento.

# Core: stanze

Implementa la sezione "Stanze" del contratto, per intero.

## Punti da non sbagliare

- La task `tags-api` è già unita.
- `ShelfOut` ha già `room_id`: resta, e si aggiunge `room`.
- `shelf_count` con una sola query.
- Eliminare una stanza lascia gli scaffali (`ON DELETE SET NULL` nello schema): provalo.
- `room_id` in `NewShelf`/`ShelfPatch`: assente non cambia nulla; `null` toglie; un id non della libreria → 404 senza creare o modificare lo scaffale.

## Test

`tests/rooms_api.rs`: CRUD; doppione → 409 `room_exists`; nome vuoto o oltre 60 → 422; eliminazione che lascia gli scaffali senza stanza; `shelf_count`; ruolo senza scrittura → 403; isolamento; audit.
`tests/shelves_api.rs`: creazione e modifica con `room_id`; `null`; id estraneo → 404; `room` nella risposta.

## Acceptance criteria

- `cargo test -p bookeeper-core --test rooms_api --test shelves_api` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- `cargo test -p bookeeper-core --test openapi_errors` passa: ogni rotta nuova documenta gli errori che può dare.
- Cambiano solo: `crates/bookeeper-core/src/api/rooms.rs`, `api/shelves.rs`, `api/mod.rs`, `src/openapi.rs`, i test `rooms_api.rs`, `shelves_api.rs`.
