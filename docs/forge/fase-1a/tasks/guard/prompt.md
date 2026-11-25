Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Guardia: l'estrattore `AuthUser`

## Obiettivo

L'estrattore che ogni rotta protetta userà, in `crates/bookeeper-core/src/auth/guard.rs`.

## Interfaccia

```rust
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthUser { pub library_id: String, pub user_id: String, pub device_id: String, pub role: Role }

impl AuthUser {
    /// 403 `forbidden` se il ruolo è inferiore a `min`.
    pub fn require(&self, min: Role) -> ApiResult<()>;
}

impl axum::extract::FromRequestParts<AppState> for AuthUser { type Rejection = ApiError; … }
```

## Regole

1. Legge `Authorization: Bearer <token>`. Assente o con altro schema → 401 `unauthorized`.
2. `tokens::verify_access(&state.jwt_secret, token, now)`: `Expired` → 401 `token_expired`; `Invalid` → 401 `unauthorized`.
3. Con `state.db.run`, una sola query che unisce `devices` e `users` per `did`:
   - nessuna riga, oppure libreria o utente diversi da quelli del token → 401 `unauthorized`;
   - `revoked_at` valorizzato → 401 `device_revoked`.
4. Il ruolo restituito è quello **del database**, non quello del token: un cambio di ruolo vale subito.
5. Aggiorna `devices.last_seen` solo se il valore salvato è più vecchio di 60 secondi, così non si scrive a ogni richiesta.
6. Un errore del database → 500 `internal`, mai 401.
7. `now` viene dall'orologio di sistema in secondi Unix.

Questa task non usa `auth/sessions.rs`, che un'altra task sta scrivendo in parallelo: nei test crea libreria, utente e dispositivo con SQL diretto ed emetti il token con `tokens::issue_access`.

## Test (`crates/bookeeper-core/tests/guard.rs`)

Router di prova con `GET /whoami` (restituisce l'`AuthUser` come JSON) e `GET /admin` (chiama `require(Role::Admin)`), con `AppState::for_tests()`.

- `valid_token_passes`: 200 con libreria, utente, dispositivo e ruolo giusti.
- `missing_header_is_unauthorized`: 401 `unauthorized`.
- `basic_scheme_is_unauthorized`: `Authorization: Basic abc` → 401 `unauthorized`.
- `garbage_token_is_unauthorized`.
- `expired_token_is_token_expired`: token emesso con `now` di due ore fa → 401 `token_expired`.
- `token_of_another_database_is_unauthorized`: token firmato con il segreto di un altro `AppState` → 401 `unauthorized`.
- `revoked_device_is_device_revoked`: `revoked_at` valorizzato via SQL → 401 `device_revoked`.
- `deleted_device_is_unauthorized`.
- `role_comes_from_the_database`: token emesso come `member`, ruolo cambiato in `admin` via SQL → `/whoami` dice `admin` e `/admin` risponde 200.
- `require_rejects_lower_roles`: un `member` su `/admin` → 403 `forbidden`.
- `last_seen_is_updated_at_most_once_a_minute`: con `last_seen` di 10 secondi fa resta invariato; con `last_seen` di 2 minuti fa viene aggiornato.

## Acceptance criteria

- `cargo test -p bookeeper-core --test guard` passa con gli undici test.
- Solo `auth/guard.rs` e `tests/guard.rs` sono cambiati.
- Ogni risposta d'errore ha `content-type: application/json` e un `error_code` del contratto.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
