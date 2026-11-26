Leggi prima `docs/forge/fase-4a/CONTRATTO.md`. Tutte le task del core del run 4A sono già unite. Leggi `packages/api/src/` (risorse esistenti, `resources/util.ts`, i test) e segui la stessa forma.

# Client TypeScript per le rotte della fase 4

## Cosa fare

1. **Istantanea e tipi**: `UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi -- --include-ignored`; `npm ci`; `npm run gen -w @bookeeper/api`.
2. **Risorse nuove** in `packages/api/src/resources/`: `reading.ts` (`getReading`, `setReading`, `clearReading`, `listReading`), `tags.ts` (`listTags`, `createTag`, `updateTag`, `deleteTag`, `setBookTags`), `rooms.ts` (`listRooms`, `createRoom`, `updateRoom`, `deleteRoom`), `audit.ts` (`listAudit`, `listAuditActions`), più `getBookFacets` e i parametri nuovi in `books.ts`, `listBorrowers` in `loans.ts`, `getReadingStats` in `stats.ts`. Tipi presi dallo schema generato ed esportati da `index.ts`. Parametri ripetibili (`tag_id`) serializzati come chiave ripetuta.
3. Collega le risorse in `client.ts`.
4. `crates/bookeeper-core/tests/openapi_errors.rs`: aggiungi alle liste del test le rotte nuove che richiedono un ruolo, se il test le elenca a mano.

## Test

In `packages/api/src/resources.test.ts` (o file accanto, seguendo l'uso): per ogni funzione nuova, metodo e percorso esatti, corpo o parametri; `getReading` che restituisce `null`; `tag_id` ripetuto; `clearReading` e `deleteTag` senza corpo di risposta; errori che diventano `ApiError` col codice del core.

## Acceptance criteria

- `cargo test -p bookeeper-core --test openapi --test openapi_errors -- --include-ignored` passa.
- `npm run gen -w @bookeeper/api` non produce differenze dopo il commit (`git diff --exit-code packages/api`).
- `npm test -w @bookeeper/api` passa; `npm run typecheck` dalla radice passa (se i tipi nuovi di `BookOut` o `ShelfOut` rompono `apps/desktop` o `apps/mobile`, elenca i punti e fermati: quei file non sono tuoi).
- Cambiano solo: file sotto `packages/api/` e `crates/bookeeper-core/tests/openapi_errors.rs`.
