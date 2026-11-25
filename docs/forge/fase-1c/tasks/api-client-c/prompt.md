Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Client TypeScript: lookup, file, backup

## Obiettivo

Allineare `packages/api` alle rotte del run 1C. Alcune trasportano file, non JSON: il trasporto guadagna un secondo metodo. Leggi `packages/api/src/` e i test esistenti prima di scrivere.

## Cosa fare

1. **Istantanea e tipi.** `UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi -- --include-ignored`; `npm ci`; `npm run gen -w @bookeeper/api`.

2. **Trasporto binario** (`src/transport.ts`). Aggiungi a `Transport` un metodo facoltativo:

   ```ts
   interface RawRequest { method: 'GET'|'POST'|'PUT'; path: string; body?: Uint8Array; contentType?: string; headers?: Record<string, string> }
   interface RawResponse { status: number; bytes: Uint8Array; contentType: string | null; headers: Record<string, string> }
   requestRaw?(req: RawRequest): Promise<RawResponse>;
   ```

   `createFetchTransport` lo implementa: stesso `Authorization` di `request`, stessi errori di rete → `ApiError('network')`. `headers` della risposta contiene almeno `etag`, `content-disposition`, `x-labels-skipped`, `retry-after`, in minuscolo, quando presenti. `request` accetta anch'esso un quarto argomento facoltativo `headers`, per `X-Confirm-Token`.

3. **Client.** Metodi nuovi in `src/resources/` (un file per area):
   - `lookupIsbn(isbn, { fresh? })`;
   - `getCover(bookId, { ifNoneMatch? })` → `{ bytes, etag } | null` (`null` su 304), `uploadCover(bookId, bytes)`, `fetchCover(bookId, candidates)`, `deleteCover(bookId)`;
   - `importBooks({ format, content, dry_run })`, `exportLibrary(format)` → `{ bytes, filename }`;
   - `confirm(password?)` → `{ confirm_token, expires_in }`;
   - `createBackup()` → `{ bytes, filename }`, `restoreBackup(bytes, confirmToken)`, `listBackups()`, `getBackupConfig()`, `setBackupConfig(config)`;
   - `labelsPdf(bookIds)` → `{ bytes, skipped }`.

   Regole:
   - I metodi che ricevono o inviano file usano `requestRaw`. Se il trasporto non lo ha, lanciano `ApiError(0, 'raw_unsupported', …)`.
   - Una risposta d'errore a una richiesta binaria ha corpo JSON: decodifica i byte e produci lo stesso `ApiError` (`status`, `code`, `retryAfter`) delle richieste JSON.
   - `filename` viene da `Content-Disposition`; se manca, un nome predefinito sensato.
   - `skipped` viene da `X-Labels-Skipped`, 0 se manca.

4. **Esportazioni**: i tipi nuovi degli schemi (`Metadata`, `ImportReport`, `RestoreReport`, …) e `RawRequest`, `RawResponse`.

`apps/desktop` e `apps/mobile` devono compilare senza modifiche: `requestRaw` è facoltativo proprio per questo.

## Test (`src/files.test.ts`)

Trasporto finto con `request` e `requestRaw` registrati; per il trasporto fetch, un `fetch` finto.

- ogni metodo nuovo: metodo HTTP, percorso, corpo e intestazioni sono quelli del contratto;
- `lookupIsbn('978-0-306-40615-7', { fresh: true })` chiama `/api/v1/lookup/isbn/978-0-306-40615-7?fresh=true`;
- `getCover` restituisce `null` su 304 e invia `If-None-Match` quando dato;
- `uploadCover` invia i byte tali e quali con `contentType: 'application/octet-stream'`;
- `restoreBackup` invia `X-Confirm-Token`;
- `exportLibrary('csv')` ricava `filename` da `attachment; filename="bookeeper-casa-20261124.csv"`;
- `labelsPdf` legge `skipped` da `X-Labels-Skipped: 3`;
- un 400 `invalid_archive` in risposta a `restoreBackup` diventa `ApiError` con quel codice;
- senza `requestRaw` nel trasporto, `getCover` lancia `ApiError` con `code === 'raw_unsupported'`;
- trasporto fetch: `requestRaw` aggiunge `Authorization`, restituisce i byte e le intestazioni in minuscolo, e mappa un guasto di rete su `ApiError('network')`.

I test esistenti del pacchetto restano e passano.

## Acceptance criteria

- `cargo test -p bookeeper-core --test openapi -- --include-ignored` passa.
- `npm run gen -w @bookeeper/api && git diff --exit-code packages/api/src/schema.d.ts` non mostra differenze dopo il commit.
- `npm test -w @bookeeper/api` passa.
- `npm run typecheck -w @bookeeper/api -w @bookeeper/desktop -w @bookeeper/mobile` passa, senza modifiche ai file delle due app.
- Solo file sotto `packages/api/` sono cambiati.
