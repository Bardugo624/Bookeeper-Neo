Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Abbinamento: codici monouso per aggiungere un dispositivo

## Obiettivo

Le rotte `POST /api/v1/pairing/codes` e `POST /api/v1/pairing/redeem` in `crates/bookeeper-core/src/api/pairing.rs`. Tabella `pairing_codes`: vedi `src/db/migrations/0001_schema.sql`. In questa fase esiste solo il tipo `device`; il tipo `invite` arriva nella fase 6 e non va implementato.

## Regole

**Creare un codice** (`AuthUser`, ruolo `member` o superiore; `guest` → 403 `forbidden`):
- genera il codice con `tokens::new_pairing_code`, salva solo `tokens::hash_code(code)`;
- riga con `kind = 'device'`, `user_id` e `created_by` uguali all'utente che lo chiede, `role` nullo, `expires_at = now + PAIRING_TTL_SECS`;
- prima di inserire, cancella i codici scaduti della stessa libreria;
- risposta 201 `{ "code": "ABCD2345", "expires_at": <secondi Unix> }`. Il codice in chiaro esiste solo in questa risposta.

**Riscattare un codice** (pubblico):
- il codice è confrontato con `tokens::hash_code`, quindi maiuscole, spazi e trattini non contano;
- in una sola transazione: `UPDATE pairing_codes SET used_at = ?now WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?now AND kind = 'device'`; se nessuna riga cambia → 401 `pairing_code_invalid`, con la stessa risposta per codice errato, scaduto o già usato;
- poi crea il dispositivo per l'utente del codice con `sessions::create_device`, con il ruolo attuale dell'utente → 200 `AuthOut` (riusa i tipi di `crate::api::setup`);
- due riscatti concorrenti dello stesso codice: uno solo riesce.

Validazione di `device_name` e `device_kind` come da contratto, prima di consumare il codice: un 422 non brucia il codice. Annota le rotte e registra gli schemi in `Doc`.

## Test (`crates/bookeeper-core/tests/pairing_api.rs`)

Usa `mod common;`.

- `member_creates_a_code`: 201; il codice ha 8 caratteri dell'alfabeto; `expires_at` è circa `now + 600`; nel database c'è solo l'hash.
- `guest_cannot_create_a_code`: 403 `forbidden`.
- `creating_a_code_needs_a_token`: 401 `unauthorized`.
- `redeem_pairs_a_new_device_for_the_same_user`: 200; `user.id` è quello di chi ha creato il codice; il dispositivo è nuovo e di tipo `mobile`; il suo token di accesso è valido (`verify_access`).
- `redeem_ignores_case_spaces_and_dashes`.
- `code_is_single_use`: il secondo riscatto → 401 `pairing_code_invalid`.
- `expired_code_is_invalid`: `expires_at` portato nel passato via SQL → 401 `pairing_code_invalid`.
- `wrong_code_is_invalid`.
- `invalid_device_kind_does_not_burn_the_code`: 422, poi lo stesso codice con dati validi → 200.
- `expired_codes_are_purged_on_create`: un codice scaduto inserito via SQL sparisce dopo una nuova creazione.
- `concurrent_redeem_one_wins`: due richieste insieme con `tokio::join!` → esattamente un 200 e un 401.

## Acceptance criteria

- `cargo test -p bookeeper-core --test pairing_api` passa con gli undici test.
- Solo `api/pairing.rs` e `tests/pairing_api.rs` sono cambiati.
- Le due rotte compaiono in `bookeeper_core::openapi()`.
- Il codice in chiaro non è mai salvato né scritto nei log.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
