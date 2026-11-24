Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Client TypeScript: istantanea aggiornata e informazioni del server

## Obiettivo

Allineare `packages/api` al core dopo il run 1D: rotta `GET /server` nuova e risposte d'errore documentate. Leggi `packages/api/src/` e i test esistenti prima di scrivere.

## Cosa fare

1. **Istantanea e tipi.** `UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi -- --include-ignored`; `npm ci`; `npm run gen -w @bookeeper/api`.
2. **Risorsa nuova** `packages/api/src/resources/server.ts`: `getServerInfo()` → `{ version, tls, public_url, phone_ready }`, con i tipi presi dallo schema generato (`ServerOut`, `TlsMode`). Non richiede token: funziona su un client senza sessione. Segui la forma delle altre risorse e collegala in `client.ts` e `index.ts` (tipi `ServerInfo` e `TlsMode` esportati).
3. Nessun'altra modifica all'interfaccia pubblica. Se i tipi rigenerati rompono codice esistente (per esempio una risposta d'errore ora tipizzata), adatta il minimo e dichiaralo nel rapporto.

## Test

`packages/api/src/resources.test.ts` (o un file accanto, seguendo l'uso esistente):

- `getServerInfo requests GET /api/v1/server`: metodo e percorso esatti, nessun corpo.
- `getServerInfo works without a session`: su un client senza sessione la chiamata riesce e non tenta alcun rinnovo del token.
- `getServerInfo returns the body as is`: `public_url: null` resta `null`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test openapi -- --include-ignored` passa (l'istantanea coincide col core).
- `npm run gen -w @bookeeper/api` non produce differenze dopo il commit (`git diff --exit-code packages/api`).
- `npm test -w @bookeeper/api` e `npm run typecheck` (dalla radice) passano.
- `packages/api/openapi.json` contiene il percorso `/api/v1/server`.
- Cambiano solo: `packages/api/openapi.json`, `packages/api/src/schema.d.ts`, `packages/api/src/client.ts`, `packages/api/src/index.ts`, file sotto `packages/api/src/resources/`, `packages/api/src/resources.test.ts`.
