Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Primitive di autenticazione: password, token, codici

## Obiettivo

Funzioni pure, senza database né rotte, in `crates/bookeeper-core/src/auth/password.rs` e `auth/tokens.rs`.

## Interfacce

```rust
// password.rs
pub fn hash(password: &str) -> Result<String, argon2::password_hash::Error>;   // Argon2id, stringa PHC
pub fn verify(password: &str, phc: &str) -> bool;                              // false su hash malformato
/// Runs a verification against a fixed dummy hash, to keep timing equal when no user matches.
pub fn verify_dummy(password: &str);

// tokens.rs
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AccessClaims { pub lid: String, pub uid: String, pub did: String, pub role: Role, pub iat: i64, pub exp: i64 }

#[derive(Debug, PartialEq, Eq)]
pub enum TokenError { Expired, Invalid }

pub fn issue_access(secret: &[u8], who: &Identity, now: i64) -> String;        // HS256, exp = now + ACCESS_TTL_SECS
pub fn verify_access(secret: &[u8], token: &str, now: i64) -> Result<AccessClaims, TokenError>;

pub fn new_refresh() -> (String, String);       // (token grezzo, hash): 32 byte casuali in base64url senza padding
pub fn hash_refresh(raw: &str) -> String;       // SHA-256 esadecimale
pub fn new_pairing_code() -> String;            // 8 caratteri dell'alfabeto del contratto
pub fn new_setup_code() -> String;              // 12 caratteri, formato "XXXX-XXXX-XXXX"
pub fn hash_code(code: &str) -> String;         // maiuscole, senza spazi né trattini, poi SHA-256 esadecimale
```

`verify_access` confronta la scadenza con il `now` passato, non con l'orologio di sistema: disattiva il controllo interno della libreria JWT e fallo a mano. Accetta solo HS256. Un token scaduto ma con firma valida dà `Expired`; ogni altro problema dà `Invalid`.

I codici usano un generatore crittograficamente sicuro e non hanno distorsione verso alcuni caratteri.

## Test (`crates/bookeeper-core/tests/auth_primitives.rs`)

- `password_round_trip`: `verify("corretta", &hash("corretta"))` è vero, con un'altra password è falso; due hash della stessa password sono diversi; l'hash inizia con `$argon2id$`.
- `verify_rejects_garbage_hash`: `verify("x", "not-a-hash")` è falso, senza panic.
- `access_token_round_trip`: emesso a `now = 1000`, verificato a `1000 + 899` restituisce gli stessi `lid`, `uid`, `did`, `role` e `exp == 1900`.
- `access_token_expires`: verificato a `1000 + 900` dà `Expired`.
- `access_token_rejects_other_secret`: verificato con un altro segreto dà `Invalid`.
- `access_token_rejects_tampering`: cambiando un carattere del payload dà `Invalid`.
- `access_token_rejects_alg_none`: un token costruito a mano con `{"alg":"none"}` e firma vuota dà `Invalid`.
- `refresh_tokens_are_unique_and_hashed`: 100 token sono tutti diversi, lunghi 43 caratteri; `hash_refresh(raw)` coincide con l'hash restituito ed è lungo 64.
- `pairing_code_shape`: 200 codici hanno 8 caratteri, tutti nell'alfabeto, e mai `0 O 1 I L`.
- `setup_code_shape`: corrisponde a `^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$`.
- `hash_code_ignores_case_spaces_and_dashes`: `hash_code("abcd-2345") == hash_code("ABCD 2345") == hash_code("ABCD2345")`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test auth_primitives` passa con gli undici test.
- Solo `auth/password.rs`, `auth/tokens.rs` e il file di test sono cambiati.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
