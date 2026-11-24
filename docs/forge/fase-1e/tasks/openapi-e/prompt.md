Leggi prima `docs/forge/fase-1e/CONTRATTO.md` e i quattro contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# OpenAPI: errori delle rotte JSON e `public_url` obbligatorio

## Obiettivo

Correggere quattro difetti P3 trovati dal revisore nel run 1D e riallineare il client TypeScript.

## Cosa fare

1. **Errori dell'estrattore JSON documentati ovunque.** `ApiJson` (`crates/bookeeper-core/src/extract.rs`) risponde 400 `bad_request`, 413 `payload_too_large` e 422 `validation`. Oggi `POST /api/v1/auth/refresh` non documenta il 422 e quasi nessuna rotta JSON documenta il 413.
   In `crates/bookeeper-core/src/openapi.rs`, dentro `openapi()`, aggiungi un passaggio finale: per ogni operazione il cui `requestBody` ha contenuto `application/json`, aggiungi le risposte 400, 413 e 422 che mancano, con corpo `ApiErrorBody` e descrizione uguale al codice d'errore (`bad_request`, `payload_too_large`, `validation`). Una risposta già documentata dalla rotta NON DEVE essere sovrascritta. Il passaggio è idempotente.
   Verifica che ogni rotta con corpo `application/json` usi davvero `ApiJson`. Se una non lo fa, non correggerla: dichiaralo nel rapporto.
2. **`ServerOut.public_url` obbligatorio.** In `crates/bookeeper-core/src/api/server.rs` il campo è sempre presente nel JSON (`null` se manca l'indirizzo). Lo schema DEVE dirlo: campo in `required`, tipo annullabile.
3. **Esenzione di `GET /api/v1/setup`.** Resta in `NO_CLIENT_ERROR` in `crates/bookeeper-core/tests/openapi_errors.rs`: è approvata dal contratto. Nessuna modifica al codice.
4. **Istantanea e tipi.** `UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi -- --include-ignored`; `npm ci`; `npm run gen -w @bookeeper/api`. Se `ServerInfo.public_url` in `packages/api/src/resources/server.ts` cambia tipo (`string | null`, non più `undefined`), adatta il minimo.

## Test

In `crates/bookeeper-core/tests/openapi_errors.rs`:

- `json_operations_document_the_extractor_errors`: ogni operazione con corpo `application/json` documenta 400, 413 e 422.
- `refresh_documents_422`: `POST /api/v1/auth/refresh` documenta 422.
- `server_public_url_is_required_and_nullable`: nello schema `ServerOut`, `public_url` è in `required` e ammette `null`.
- `explicit_responses_are_kept`: una risposta 413 che una rotta dichiara già con una descrizione propria (per esempio `POST /api/v1/import`) conserva quella descrizione.

In `packages/api/src/resources.test.ts`: un controllo di tipo che `ServerInfo['public_url']` è `string | null` (assegnare `undefined` non compila: usa `// @ts-expect-error`).

## Acceptance criteria

- `cargo test -p bookeeper-core --test openapi_errors` passa.
- `cargo test -p bookeeper-core --test openapi -- --include-ignored` passa (l'istantanea coincide col core).
- `npm run gen -w @bookeeper/api` non produce differenze dopo il commit (`git diff --exit-code packages/api`).
- `npm test -w @bookeeper/api` passa; `npm run typecheck -w @bookeeper/api -w @bookeeper/desktop -w @bookeeper/mobile` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- Cambiano solo: `crates/bookeeper-core/src/openapi.rs`, `crates/bookeeper-core/src/api/server.rs`, `crates/bookeeper-core/tests/openapi_errors.rs`, `packages/api/openapi.json`, `packages/api/src/schema.d.ts`, `packages/api/src/resources/server.ts`, `packages/api/src/resources.test.ts`.
