Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# OpenAPI: risposte d'errore documentate, con un test che lo impone

## Obiettivo

Chiudere un rimando della fase 0: ogni rotta DEVE documentare le risposte d'errore che può dare. Molte lo fanno già. Qui si aggiunge il test che lo impone per sempre e si colmano i buchi che trova.

## Cosa fare

1. **Test `crates/bookeeper-core/tests/openapi_errors.rs`**, sul documento restituito da `bookeeper_core::openapi()` (serializzato in `serde_json::Value`). Per ogni operazione:
   - `every_secured_operation_documents_401`: se l'operazione ha `security`, ha una risposta `401`.
   - `every_operation_documents_a_client_error`: almeno una risposta `4xx`. Eccezioni, elencate in una costante nel test: `GET /api/v1/health`, `GET /api/v1/openapi.json`, `GET /api/v1/server`.
   - `every_error_response_uses_the_error_body`: ogni risposta `4xx` o `5xx` ha contenuto `application/json` con riferimento allo schema `ApiErrorBody`.
   - `every_operation_with_a_path_id_documents_404`: se il percorso contiene un parametro (`{…}`), ha una risposta `404`.
   - `rate_limited_operations_document_429`: le operazioni che passano dal limitatore di tentativi (cercale: `limiter` in `api/*.rs`) hanno una risposta `429`.
   - `role_gated_operations_document_403`: le operazioni il cui gestore chiama `require(Role::…)` con un ruolo sopra l'ospite, o usa un estrattore riservato al proprietario, hanno una risposta `403`. La lista delle operazioni è una costante nel test, costruita leggendo i gestori; un commento dice come aggiornarla.
   I messaggi di fallimento nominano metodo e percorso dell'operazione in difetto.
2. **Colmare i buchi** nelle annotazioni `#[utoipa::path]` sotto `crates/bookeeper-core/src/api/`. Documenta ciò che il codice fa davvero: leggi il gestore e le tabelle degli errori dei quattro contratti. Per ogni `error_code` che un gestore può restituire, la descrizione della risposta con quello stato lo nomina (più codici sullo stesso stato: separati da virgola nella descrizione).
3. **Nessun cambio di comportamento.** Si toccano solo attributi `utoipa` e, se serve, `openapi.rs` per registrare schemi. Se leggendo trovi un gestore che risponde in modo diverso dai contratti, non correggerlo: scrivilo nel rapporto.
4. Non rigenerare `packages/api/openapi.json`: lo fa `api-client-d`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test openapi_errors` passa.
- `cargo test -p bookeeper-core` passa: nessun test esistente cambia esito (il test dell'istantanea in `tests/openapi.rs` è `#[ignore]` e resta tale).
- `git diff` sotto `crates/bookeeper-core/src/api/` mostra solo righe dentro attributi `#[utoipa::path(...)]` o derive di schema: nessuna riga di logica.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
- Il rapporto elenca le operazioni a cui hai aggiunto risposte e le eventuali divergenze trovate.
- Cambiano solo: file sotto `crates/bookeeper-core/src/api/`, `crates/bookeeper-core/src/openapi.rs`, `crates/bookeeper-core/tests/openapi_errors.rs`.
