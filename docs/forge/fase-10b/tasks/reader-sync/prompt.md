Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Lettore: posizioni e note fra i dispositivi

## File
- `packages/reader/src/data/`.
- `fake-indexeddb` e `@bookeeper/api` sono già dipendenze del pacchetto.

## Cosa fare
- **`ReaderBackend`**, come nel contratto.
- **`OfflineQueue`:** `memoryQueue()` e `idbQueue(name)` sul database `bookeeper-reader`, store `queue`.
  - Le operazioni hanno un tipo (`position`, `annotation`) e l'ora.
  - `drain(send)` le manda in ordine e si ferma al primo errore di rete.
- **`createPositionKeeper(backend, fileId, storage, clock)`:**
  - `record(relocation)` salva in locale subito e sul server dopo 2000 ms;
  - `flush()` salva subito;
  - `local()` restituisce l'ultima posizione locale;
  - senza rete va nella coda.
- **`createAnnotationStore(backend, { bookId, sha256 }, clock, uuid)`:**
  - `list()`, `subscribe(fn)`, `add(...)`, `update(id, patch)` e `remove(id)` (tombstone);
  - `sync()`: manda le modifiche in attesa e prende quelle nuove con `since`;
  - vince l'ultima modifica;
  - senza rete va nella coda.
- **`sourcesFrom(positions, reading, fileId, deviceId)`:** le fonti per `decideResume`.

## Passi
- [ ] Test, prima del codice:
  - `saves_two_seconds_after_the_last_turn`;
  - `flush_saves_immediately`;
  - `local_position_is_remembered_per_file`;
  - `offline_saves_wait_in_the_queue_and_leave_later`;
  - `add_is_visible_at_once_and_sent`;
  - `a_newer_remote_edit_wins`;
  - `remove_sends_a_tombstone`;
  - `pull_since_merges_tombstones`;
  - `offline_edits_survive_a_restart_with_idb_queue`;
  - `queue_drains_in_order_and_stops_at_the_first_network_error`;
  - `positions_and_hand_typed_page_become_sources`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
