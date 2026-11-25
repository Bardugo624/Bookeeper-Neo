Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Client TypeScript: istantanea OpenAPI, tipi, metodi

## Obiettivo

Allineare `packages/api` alle rotte nuove del core. Dopo questa task la specifica versionata, i tipi generati e il client coincidono con il server.

## Cosa fare

1. **Istantanea.** Rigenera `packages/api/openapi.json`: `UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi -- --include-ignored`. Poi lo stesso comando senza la variabile deve passare.

2. **Tipi.** `npm ci` dalla root, poi `npm run gen -w @bookeeper/api`. Non modificare `src/schema.d.ts` a mano.

3. **Trasporto** (`src/transport.ts`). `createFetchTransport` accetta un terzo argomento facoltativo:

   ```ts
   createFetchTransport(baseUrl: string, fetchImpl?: typeof fetch, options?: { getAccessToken?: () => string | null | Promise<string | null> })
   ```

   Se `getAccessToken` restituisce una stringa, la richiesta porta `Authorization: Bearer <token>`. I due primi argomenti e il comportamento attuale non cambiano. L'interfaccia `Transport` non cambia: sul desktop il token lo aggiunge il guscio Rust.

4. **Client** (`src/client.ts`). `createClient(t)` espone, oltre a `health()`, un metodo per ogni rotta del contratto, con tipi presi da `components['schemas']`:

   `setupStatus()`, `setup(body)`, `login(body)`, `libraries(body)`, `refresh(refreshToken)`, `logout()`, `setPassword(body)`, `me()`, `createPairingCode()`, `redeemPairingCode(body)`, `listDevices()`, `renameDevice(id, name)`, `revokeDevice(id)`.

   - Le risposte 204 risolvono con `undefined`.
   - Ogni errore diventa `ApiError` con `status` e `code` presi dal corpo, come oggi.
   - Per un 429, `ApiError` porta anche `retryAfter: number | undefined` (secondi). Per questo `TransportResponse` guadagna il campo facoltativo `retryAfter?: number`, che il trasporto fetch riempie dall'intestazione `Retry-After`.
   - Gli `id` nei percorsi passano per `encodeURIComponent`.

5. **Esportazioni** (`src/index.ts`): i tipi di richiesta e risposta usati dai metodi (`AuthOut`, `Session`, `DeviceOut`, `LibraryOut`, `UserOut`, `SetupStatus` e i corpi delle richieste), con i nomi degli schemi.

Il tipo di ritorno di `createClient` cresce: `apps/desktop` e `apps/mobile` passano ai loro componenti un oggetto con il solo `health`, e devono continuare a compilare senza modifiche.

## Test

In `src/client.test.ts`, con un trasporto finto che registra le chiamate:
- per ogni metodo: metodo HTTP, percorso e corpo inviati sono quelli del contratto;
- `logout`, `setPassword`, `revokeDevice` risolvono con `undefined` su 204;
- `renameDevice('a/b', 'x')` chiama `/api/v1/devices/a%2Fb`;
- un 401 `token_expired` diventa `ApiError` con `code === 'token_expired'`;
- un 429 con `retryAfter: 30` diventa `ApiError` con `retryAfter === 30`.

In `src/auth.test.ts`, sul trasporto fetch:
- con `getAccessToken` che restituisce `'tok'`, l'intestazione è `Authorization: Bearer tok`, anche quando la funzione è asincrona;
- con `null` o senza opzioni, l'intestazione `Authorization` è assente;
- l'intestazione `Retry-After: 30` finisce in `retryAfter`; un valore non numerico dà `undefined`.

I sette test esistenti restano e passano.

## Acceptance criteria

- `cargo test -p bookeeper-core --test openapi -- --include-ignored` passa.
- `npm run gen -w @bookeeper/api && git diff --exit-code packages/api/src/schema.d.ts` non mostra differenze dopo il commit.
- `npm test -w @bookeeper/api` passa, con i test nuovi e i sette vecchi.
- `npm run typecheck` dalla root passa per tutti i pacchetti, `@bookeeper/desktop` e `@bookeeper/mobile` inclusi, senza modifiche ai loro file.
- Solo file sotto `packages/api/` sono cambiati.
- `packages/api/openapi.json` contiene tutti i percorsi del contratto.
