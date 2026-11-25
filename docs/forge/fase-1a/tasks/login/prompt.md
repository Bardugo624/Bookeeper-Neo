Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Accesso: login, librerie, rinnovo, uscita, password, profilo

## Obiettivo

Le rotte di `crates/bookeeper-core/src/api/auth.rs`: `POST /auth/login`, `POST /auth/libraries`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/password`, `GET /me`. Corpi e risposte nel contratto. Riusa `AuthOut`, `LibraryOut`, `UserOut` da `crate::api::setup` se esistono già; se la task `setup` non è ancora unita, definiscili in questo file con gli stessi campi e segnalalo nel messaggio finale.

## Regole

**Login.** Cerca gli utenti con quell'email normalizzata, filtrati per `library_id` se presente. Verifica la password su ognuno; un utente senza password non corrisponde mai.
- Nessuna corrispondenza → 401 `invalid_credentials`. La risposta è identica per email sconosciuta e password errata, e in entrambi i casi viene eseguita una verifica Argon2 (`password::verify_dummy` se non c'è alcun utente), per non rivelare quali email esistono.
- Più librerie corrispondono → 409 `library_choice_required`, senza creare dispositivi.
- Una sola → crea il dispositivo con `sessions::create_device` → 200 `AuthOut`.

**Librerie.** `POST /auth/libraries` restituisce solo le librerie in cui email e password corrispondono. Nessuna → 401 `invalid_credentials`. Non esiste modo di elencare le librerie senza credenziali valide.

**Rinnovo.** `sessions::refresh`: `Invalid` → 401 `refresh_invalid`; `Reused` → 401 `refresh_reused`; `Revoked` → 401 `device_revoked`.

**Uscita.** Revoca il dispositivo che fa la richiesta → 204. Dopo, il suo token di accesso riceve 401 `device_revoked`.

**Password.** `POST /auth/password`: se l'utente ha già una password, `current_password` è obbligatoria (assente → 409 `password_required`; errata → 401 `invalid_credentials`). Se non ne ha, basta `new_password`. Se l'utente non ha un'email, impostare la password risponde 422 `validation` (messaggio: an email is required before setting a password). Cambiare la password revoca tutti gli altri dispositivi dello stesso utente.

**Profilo.** `GET /me` → libreria, utente e dispositivo corrente (`current: true`).

Argon2 gira dentro `db.run`. Validazione come da contratto. Annota tutte le rotte e registra gli schemi in `Doc`.

## Test (`crates/bookeeper-core/tests/auth_api.rs`)

Usa `mod common;` (`seed`, `add_user`, `call`).

- `login_creates_a_new_device`: 200, `session.device_id` diverso da quello del seme; `GET /devices` non serve: conta le righe via SQL.
- `login_is_case_and_space_insensitive_on_email`.
- `wrong_password_and_unknown_email_look_the_same`: stesso stato, stesso corpo.
- `user_without_password_cannot_log_in`.
- `same_email_in_two_libraries_needs_a_choice`: 409 `library_choice_required`; con `library_id` → 200 sulla libreria giusta.
- `libraries_lists_only_matching_ones`: stessa email in due librerie con password diverse → una sola libreria.
- `libraries_with_wrong_password_is_invalid_credentials`.
- `refresh_returns_a_new_session_and_old_token_is_reused`: il secondo uso del token vecchio → 401 `refresh_reused`, poi il token di accesso → 401 `device_revoked`.
- `unknown_refresh_token_is_refresh_invalid`.
- `logout_revokes_this_device_only`: l'altro dispositivo dello stesso utente funziona ancora.
- `me_returns_library_user_and_device`.
- `set_first_password_without_current`; `change_password_requires_current`; `wrong_current_password_is_invalid_credentials`.
- `changing_password_revokes_other_devices`.
- `setting_a_password_without_email_is_validation`.
- `protected_routes_need_a_token`: `GET /me`, `POST /auth/logout`, `POST /auth/password` senza token → 401 `unauthorized`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test auth_api` passa con tutti i test elencati.
- Solo `api/auth.rs` e `tests/auth_api.rs` sono cambiati.
- Le sei rotte compaiono in `bookeeper_core::openapi()`.
- Password e token non compaiono in nessun log.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
