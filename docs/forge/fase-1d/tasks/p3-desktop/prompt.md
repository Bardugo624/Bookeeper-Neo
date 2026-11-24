Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Desktop: le intestazioni delle richieste JSON arrivano al core

## Obiettivo

Chiudere un difetto P3. In `apps/desktop/src/transport.ts` il metodo `request` passa `headers` al comando Tauri `api_request`, ma il comando non ha quell'argomento: le intestazioni si perdono in silenzio. Una rotta JSON che richiede `X-Confirm-Token` risponderebbe 401 solo sul desktop.

## Cosa fare

1. `apps/desktop/src-tauri/src/dispatch.rs`: `dispatch` riceve un quinto argomento `headers: BTreeMap<String, String>`. Applica alla richiesta le stesse regole di `dispatch_raw`: stessa lista di intestazioni ammesse, tutto il resto scartato, valori non validi scartati. Estrai la parte comune in una funzione privata: una sola lista, una sola logica.
2. `apps/desktop/src-tauri/src/lib.rs`: il comando `api_request` riceve `headers: Option<BTreeMap<String, String>>` e lo passa a `dispatch` (assente → mappa vuota).
3. `apps/desktop/src/transport.ts`: nessun cambio di comportamento atteso; verifica che il nome dell'argomento inviato coincida con quello del comando.
4. `Authorization` segue la stessa strada di oggi: non cambiare come viaggia il token di accesso.

## Test

- `dispatch.rs` (test esistenti nel modulo, più):
  - `json_requests_carry_allowed_headers`: router di prova con una rotta che restituisce il valore di `X-Confirm-Token`; `dispatch` con quell'intestazione → il valore arriva.
  - `json_requests_drop_other_headers`: un'intestazione fuori lista (per esempio `Host` o `X-Forwarded-For`) non arriva.
  - I test esistenti di `dispatch` passano con una mappa vuota.
- `apps/desktop/src/transport.test.ts`:
  - `request forwards headers to api_request`: `invoke` finto; `request('POST', '/x', {}, { 'X-Confirm-Token': 't' })` chiama `api_request` con `headers` uguale a `{ 'X-Confirm-Token': 't' }`.
  - `request omits headers when none are given`.

## Acceptance criteria

- `cargo test -p bookeeper-desktop` passa.
- `npm test -w @bookeeper/desktop` e `npm run typecheck -w @bookeeper/desktop` passano.
- `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` è pulito.
- La lista delle intestazioni ammesse compare una sola volta in `dispatch.rs`.
- Cambiano solo: `apps/desktop/src-tauri/src/dispatch.rs`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src/transport.ts`, `apps/desktop/src/transport.test.ts`.
