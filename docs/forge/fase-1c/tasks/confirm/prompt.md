Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Conferma con password per le operazioni distruttive

## Obiettivo

Un token di conferma a vita breve, ottenuto riscrivendo la password, che le operazioni distruttive richiederanno (design §6.4). Rotta in `crates/bookeeper-core/src/api/confirm.rs`, primitive in `auth/tokens.rs`.

## Primitive (`auth/tokens.rs`, aggiunte)

```rust
pub const CONFIRM_TTL_SECS: i64 = 300;
/// JWT HS256 distinto dai token di accesso: non è mai accettato come token di accesso, né viceversa.
pub fn issue_confirm(secret: &[u8], who: &Identity, now: i64) -> String;
pub fn verify_confirm(secret: &[u8], token: &str, now: i64) -> Result<AccessClaims, TokenError>;
```

La distinzione si ottiene con un campo dedicato nel payload (per esempio `"knd": "confirm"`) controllato da entrambe le verifiche: aggiungi il campo anche ai token di accesso (`"access"`) e fai rifiutare a `verify_access` ciò che non è `access`. I token di accesso già emessi senza quel campo restano validi fino alla scadenza (15 minuti): un campo assente vale `access`.

## Rotta

`POST /api/v1/auth/confirm` (`AuthUser`), corpo `{ "password": string? }`:
- l'utente ha una password: `password` è obbligatoria (assente → 422 `validation`); errata → 401 `invalid_credentials`; giusta → 200 `{ "confirm_token", "expires_in": 300 }`;
- l'utente non ha una password (libreria locale creata senza): 200 senza controllare nulla. È il caso dell'app desktop con il core in processo.
- I tentativi errati contano nel limitatore con la chiave `confirm:<user_id>` e la regola `limit::LOGIN` (`begin` / `failed` / `succeeded`), come il login.
- Argon2 dentro `db.run`.

## Estrattore

In `api/confirm.rs`:

```rust
/// Richiede, oltre al token di accesso, un token di conferma valido nell'intestazione `X-Confirm-Token`,
/// emesso per lo stesso utente e lo stesso dispositivo. Altrimenti 401 `confirmation_required`.
pub struct Confirmed(pub AuthUser);
impl FromRequestParts<AppState> for Confirmed { … }
```

Il token di conferma non è monouso: vale per i suoi 5 minuti.

## Test (`crates/bookeeper-core/tests/confirm_api.rs`)

Usa `mod common;`. Per l'estrattore, un router di prova con una rotta che prende `Confirmed`.

- `confirm_with_the_right_password`; `confirm_with_the_wrong_password_is_invalid_credentials`; `confirm_without_password_when_one_is_set_is_validation`; `confirm_without_password_when_none_is_set_succeeds`.
- `wrong_confirmations_are_rate_limited`: dopo cinque errori → 429.
- `confirm_token_is_not_an_access_token`: usato come `Authorization: Bearer` su `GET /me` → 401.
- `access_token_is_not_a_confirm_token`: usato in `X-Confirm-Token` → 401 `confirmation_required`.
- `legacy_access_token_without_kind_still_works`: un token costruito a mano senza il campo → `verify_access` lo accetta.
- `confirmed_extractor_accepts_a_fresh_token`; `confirmed_extractor_rejects_missing_expired_and_foreign_tokens` (assente; emesso 301 secondi fa; emesso per un altro utente; emesso per un altro dispositivo dello stesso utente).
- `confirm_needs_a_token`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test confirm_api` passa con tutti i test elencati.
- `cargo test -p bookeeper-core --test auth_primitives --test guard --test auth_api` passa senza modifiche a quei file.
- Cambiano solo `auth/tokens.rs`, `api/confirm.rs`, `tests/confirm_api.rs`.
- La rotta compare in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
