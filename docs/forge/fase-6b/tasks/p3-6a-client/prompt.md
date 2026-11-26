Leggi prima `docs/forge/fase-6a/CONTRATTO.md` (sezione Wishlist di famiglia). Leggi `packages/api/src/resources/wishlist.ts`, `loans.ts` (modello per i parametri di elenco) e `packages/api/src/resources6a.test.ts`.

# Client: wishlist di famiglia

Difetto P3 dal run 6A. `listWishlist()` non accetta parametri, quindi non può chiedere `GET /wishlist?scope=family`, e il tipo generato della query non è esportato.

## Cosa fare

1. `listWishlist(params?: ListWishParams)`, con `ListWishParams` ricavato dal tipo generato della query, come fa `listLoans` con `ListLoansParams`. Senza parametri la richiesta resta quella di oggi.
2. Esporta `ListWishParams` da `index.ts` come gli altri tipi.

## Test

- Senza parametri: `GET /api/v1/wishlist`. Con `{ scope: 'family' }`: `GET /api/v1/wishlist?scope=family`.

## Acceptance criteria

- `npm test -w @bookeeper/api` e `npm run typecheck -w @bookeeper/api` passano.
- `npm run typecheck -w @bookeeper/desktop` e `npm run typecheck -w @bookeeper/mobile` passano.
- Cambiano solo file sotto `packages/api/src/`.
