Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Sessioni dei dispositivi: creazione, rotazione, riuso, revoca

## Obiettivo

Le operazioni sul database che danno e tolgono l'accesso a un dispositivo, in `crates/bookeeper-core/src/auth/sessions.rs`. Niente rotte. Tabella `devices`: vedi `src/db/migrations/0001_schema.sql`.

## Interfacce

Funzioni sincrone su `&mut rusqlite::Connection`; le rotte le chiameranno dentro `db.run`.

```rust
pub struct NewDevice<'a> { pub library_id: &'a str, pub user_id: &'a str, pub role: Role, pub name: &'a str, pub kind: DeviceKind }

pub fn create_device(conn: &mut Connection, secret: &[u8], new: NewDevice<'_>, now: i64) -> rusqlite::Result<Session>;

#[derive(Debug, PartialEq, Eq)]
pub enum RefreshError { Invalid, Reused, Revoked }

pub fn refresh(conn: &mut Connection, secret: &[u8], raw_refresh: &str, now: i64) -> rusqlite::Result<Result<Session, RefreshError>>;

/// true se un dispositivo attivo di quella libreria è stato revocato ora.
pub fn revoke_device(conn: &mut Connection, library_id: &str, device_id: &str, now: i64) -> rusqlite::Result<bool>;
```

## Regole

- `create_device` inserisce la riga (`id` UUID v7, `paired_at = last_seen = now`), salva solo l'hash del token di rinnovo e restituisce una `Session` con `expires_in = ACCESS_TTL_SECS`.
- `refresh`, in **una sola transazione `IMMEDIATE`**:
  - hash uguale a `refresh_hash` di un dispositivo non revocato e `now - last_seen <= REFRESH_TTL_SECS` → ruota: `refresh_prev_hash = hash vecchio`, nuovo `refresh_hash`, `last_seen = now`; nuova `Session`. Il ruolo nel token di accesso è quello **attuale** dell'utente nel database.
  - come sopra ma oltre i 30 giorni → `Invalid`, nessuna modifica.
  - hash uguale a `refresh_prev_hash` di un dispositivo → riuso: `revoked_at = now` (se non già revocato) e `Reused`.
  - dispositivo revocato → `Revoked`.
  - nessuna corrispondenza → `Invalid`.
- Il token grezzo non viene mai salvato né scritto nei log.
- Due `refresh` concorrenti con lo stesso token: uno ruota, l'altro riceve `Reused`. È voluto.

## Aiuto per i test delle altre task

Crea `crates/bookeeper-core/tests/common/mod.rs` con:

```rust
pub struct Seeded { pub state: AppState, pub library_id: String, pub user_id: String, pub session: Session }
/// Libreria "Casa", utente "Ada" con quel ruolo, email e password facoltative, un dispositivo desktop.
pub async fn seed(role: Role, email: Option<&str>, password: Option<&str>) -> Seeded;
/// Aggiunge un utente con un dispositivo a una libreria esistente.
pub async fn add_user(state: &AppState, library_id: &str, role: Role, name: &str) -> (String, Session);
/// Invia una richiesta JSON al router e restituisce (stato, intestazioni, corpo JSON o Null).
pub async fn call(state: &AppState, method: &str, path: &str, bearer: Option<&str>, body: Option<serde_json::Value>) -> (u16, axum::http::HeaderMap, serde_json::Value);
```

`seed` usa `AppState::for_tests()`, inserisce libreria e utente con SQL diretto (password con `password::hash`) e crea il dispositivo con `create_device`. Metti `#![allow(dead_code)]` in cima.

## Test (`crates/bookeeper-core/tests/sessions.rs`)

- `create_device_stores_only_the_hash`: nella riga non compare il token grezzo; `refresh_hash == hash_refresh(raw)`.
- `access_token_carries_the_identity`: `verify_access` sul token restituisce libreria, utente, dispositivo e ruolo giusti.
- `refresh_rotates`: il nuovo token di rinnovo è diverso, quello vecchio non è più `refresh_hash`, `last_seen` è aggiornato.
- `reusing_a_rotated_token_revokes_the_device`: dopo una rotazione, il token vecchio dà `Reused` e `revoked_at` è valorizzato; poi anche il token nuovo dà `Revoked`.
- `unknown_token_is_invalid`.
- `refresh_expires_after_thirty_days_idle`: a `now + REFRESH_TTL_SECS` funziona, a `+ REFRESH_TTL_SECS + 1` dà `Invalid`.
- `refresh_picks_up_a_role_change`: cambiato il ruolo dell'utente via SQL, il token di accesso dopo il rinnovo porta il ruolo nuovo.
- `revoke_is_scoped_to_the_library`: con l'id di un'altra libreria restituisce `false` e non revoca.
- `revoke_twice_reports_false_the_second_time`.
- `concurrent_refresh_one_wins`: su file, due thread con connessioni proprie e lo stesso token: esattamente un `Ok` e un `Reused`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test sessions` passa con i dieci test, e passa 20 volte di fila.
- Solo `auth/sessions.rs`, `tests/sessions.rs`, `tests/common/mod.rs` sono cambiati.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
