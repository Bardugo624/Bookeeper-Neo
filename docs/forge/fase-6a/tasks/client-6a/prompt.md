Leggi prima `docs/forge/fase-6a/CONTRATTO.md` (sezione Client) e `docs/forge/fase-4a/CONTRATTO.md`. Le tre task del core sono già unite. Leggi `packages/api` per intero, con i test (`resources4a.test.ts` è il modello).

# Client: tipi e risorse del run 6A

## Cosa fare

1. L'istantanea `packages/api/openapi.json` è già aggiornata dalle task del core: verifica con `cargo test -p bookeeper-core --test openapi`. Rigenera `packages/api/src/schema.d.ts` con `npm run gen -w @bookeeper/api`.
2. Risorse nuove o estese in `packages/api/src/resources/`: persone (`users.ts`), inviti (`invites.ts`), `listReaders` (con i libri), `isbnIndex(version?)` (con i libri). Esportale da `index.ts` come le altre, con i tipi.
3. **Correzione al contratto**: l'ispezione del codice è un metodo del client senza sessione, `inspectPairingCode({ code })`, in `packages/api/src/client.ts` accanto a `redeemPairingCode`, non una risorsa. `redeemPairingCode` accetta il `display_name` facoltativo del tipo rigenerato.
4. Se `crates/bookeeper-core/tests/openapi_errors.rs` elenca gli errori per rotta, aggiungi le rotte nuove con i loro errori.

## Test

`packages/api/src/resources6a.test.ts`: per ogni funzione, metodo, percorso, corpo e parametri giusti, con un `Transport` finto; errori tradotti come le altre risorse.

## Acceptance criteria

- `npm test -w @bookeeper/api` e `npm run typecheck -w @bookeeper/api` passano.
- `cargo test -p bookeeper-core` passa (specifica allineata).
- Cambiano solo file sotto `packages/api/` e `crates/bookeeper-core/tests/openapi_errors.rs`.
