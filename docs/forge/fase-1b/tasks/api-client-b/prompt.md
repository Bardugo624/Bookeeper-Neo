Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Client TypeScript: le risorse

## Obiettivo

Allineare `packages/api` alle rotte del run 1B, con lo stesso schema usato per quelle del run 1A (leggi `packages/api/src/client.ts` e i suoi test prima di scrivere).

## Cosa fare

1. **Istantanea.** `UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi -- --include-ignored`, poi lo stesso comando senza la variabile deve passare.

2. **Tipi.** `npm ci` dalla root, poi `npm run gen -w @bookeeper/api`. Mai modificare `src/schema.d.ts` a mano.

3. **Client.** `createClient(t)` guadagna un metodo per ogni rotta del contratto 1B, con tipi presi da `components['schemas']`:

   - libri: `createBook(body)`, `getBook(id)`, `updateBook(id, patch)`, `deleteBook(id)`, `deleteBooks(ids)`, `nextProgressive()`, `listBooks(params?)`;
   - scaffali: `listShelves()`, `createShelf(body)`, `getShelf(id)`, `updateShelf(id, patch)`, `deleteShelf(id)`, `listShelfBooks(id)`, `placeBook(bookId, placement)`, `unplaceBook(bookId)`, `batchAssign(shelfId, bookIds)`;
   - prestiti: `listLoans(params?)`, `createLoan(body)`, `updateLoan(id, patch)`, `deleteLoan(id)`, `returnLoan(id, returnedAt?)`, `reopenLoan(id)`;
   - wishlist: `listWishlist()`, `createWish(body)`, `updateWish(id, patch)`, `deleteWish(id)`, `convertWish(id)`;
   - statistiche: `stats()`.

   Regole:
   - I parametri di `listBooks` e `listLoans` diventano una query string: i valori `undefined` sono omessi, i booleani scritti `true`/`false`, tutto passato per `encodeURIComponent`. Nessun `?` finale se non c'è alcun parametro.
   - Gli `id` nei percorsi passano per `encodeURIComponent`.
   - Le risposte 204 risolvono con `undefined`.
   - Nei `patch`, `null` viene inviato così com'è (svuota il campo) e `undefined` è omesso: è il comportamento di `JSON.stringify`, non aggiungere altro.
   - Gli errori restano `ApiError` con `status`, `code` e `retryAfter`.

4. **Esportazioni** (`src/index.ts`): i tipi usati dai metodi, con i nomi degli schemi (`BookOut`, `ShelfOut`, `ShelfBook`, `Placement`, `LoanOut`, `WishOut`, `Stats` e i corpi delle richieste).

Se `client.ts` supera le 250 righe, dividi per risorsa in file `src/resources/*.ts` che `createClient` compone; i nomi dei metodi e il tipo di ritorno non cambiano. `apps/desktop` e `apps/mobile` devono continuare a compilare senza modifiche.

## Test (`src/resources.test.ts`)

Con il trasporto finto che registra le chiamate, già usato in `client.test.ts`:

- per ogni metodo: metodo HTTP, percorso e corpo sono quelli del contratto;
- `listBooks()` chiama `/api/v1/books` senza `?`;
- `listBooks({ q: 'il nome della rosa', on_loan: false, limit: 20 })` chiama `/api/v1/books?q=il%20nome%20della%20rosa&on_loan=false&limit=20` (l'ordine dei parametri segue quello dell'oggetto);
- `listBooks({ q: undefined, genre: 'giallo' })` omette `q`;
- `getBook('a/b')` chiama `/api/v1/books/a%2Fb`;
- `updateBook('1', { subtitle: null })` invia `{"subtitle":null}`;
- `deleteBook`, `deleteShelf`, `unplaceBook`, `deleteLoan`, `deleteWish` risolvono con `undefined` su 204;
- `returnLoan('1')` invia `{}` e `returnLoan('1', 1700000000)` invia `{"returned_at":1700000000}`;
- un 409 `slot_taken` diventa `ApiError` con `code === 'slot_taken'`.

I test esistenti del pacchetto restano e passano.

## Acceptance criteria

- `cargo test -p bookeeper-core --test openapi -- --include-ignored` passa.
- `npm run gen -w @bookeeper/api && git diff --exit-code packages/api/src/schema.d.ts` non mostra differenze dopo il commit.
- `npm test -w @bookeeper/api` passa, con i test nuovi e tutti i vecchi.
- `npm run typecheck -w @bookeeper/api -w @bookeeper/desktop -w @bookeeper/mobile` passa, senza modifiche ai file delle due app.
- Solo file sotto `packages/api/` sono cambiati.
- `packages/api/openapi.json` contiene tutti i percorsi del contratto 1B.
