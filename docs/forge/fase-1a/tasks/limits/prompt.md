Leggi prima `docs/forge/fase-1a/CONTRATTO.md`: regole comuni, errori, tipi condivisi e rotte valgono anche qui.

# Limiti di tentativi su login, abbinamento e setup

## Obiettivo

Fermare chi prova password e codici a ripetizione. Un limitatore in memoria in `crates/bookeeper-core/src/auth/limit.rs`, tenuto in `AppState`, usato dalle rotte già esistenti in `api/auth.rs`, `api/pairing.rs`, `api/setup.rs`.

## Interfaccia

```rust
#[derive(Debug, Clone, Copy)]
pub struct Rule { pub max_failures: u32, pub window_secs: i64 }

pub const LOGIN: Rule = Rule { max_failures: 5, window_secs: 900 };      // per email
pub const REDEEM: Rule = Rule { max_failures: 10, window_secs: 600 };    // globale
pub const SETUP: Rule = Rule { max_failures: 5, window_secs: 900 };      // globale

#[derive(Default)]
pub struct RateLimiter { /* Mutex<HashMap<String, …>> */ }

impl RateLimiter {
    /// Err(retry_after_secs) se la chiave ha già raggiunto il limite dentro la finestra.
    pub fn check(&self, key: &str, rule: Rule, now: i64) -> Result<(), u64>;
    pub fn record_failure(&self, key: &str, rule: Rule, now: i64);
    pub fn reset(&self, key: &str);
}
```

Aggiungi `pub limiter: std::sync::Arc<RateLimiter>` ad `AppState` (inizializzato in `open` e `for_tests`).

## Regole

- Si contano solo i **fallimenti**. Un successo azzera la chiave (`reset`).
- Finestra scorrevole: contano i fallimenti degli ultimi `window_secs`. `retry_after` è il tempo che manca perché il più vecchio esca dalla finestra, almeno 1.
- Le voci scadute vengono eliminate, così la mappa non cresce senza limite: al più una voce per chiave attiva, e una pulizia quando la mappa supera 10.000 chiavi.
- Chiavi: `login:<email normalizzata>` per `POST /auth/login` e `POST /auth/libraries` (stessa chiave: sono lo stesso tentativo sulle credenziali); `redeem` per `POST /pairing/redeem`; `setup` per `POST /setup` con `SetupPolicy::CodeRequired`.
- In ogni rotta: prima `check` → se bloccata, 429 `rate_limited` con `Retry-After`, **senza** verificare password né codice; poi l'operazione; su `invalid_credentials`, `pairing_code_invalid`, `setup_code_invalid` → `record_failure`; su successo → `reset`.
- Non contano come fallimenti: 422 `validation`, 409 `library_choice_required`, 409 `setup_closed`, errori 5xx.
- Con `SetupPolicy::Open` il setup non è limitato.
- Mentre una chiave `login:` è bloccata, anche la password giusta riceve 429. È voluto.
- `POST /auth/refresh` non è limitato qui: il riuso di un token revoca già il dispositivo.

Modifica le tre rotte il minimo necessario: non cambiare il loro comportamento in nessun altro caso. I test esistenti di quelle rotte devono passare senza modifiche.

## Test (`crates/bookeeper-core/tests/limits.rs`)

Unità, con `now` esplicito:
- `allows_until_the_limit`; `blocks_at_the_limit_with_retry_after`; `window_slides` (dopo `window_secs` dal primo fallimento si può riprovare); `reset_clears_the_key`; `keys_are_independent`; `expired_entries_are_dropped`.

Attraverso il router, con `mod common;`:
- `sixth_wrong_password_is_rate_limited`: cinque 401, il sesto è 429 `rate_limited` con `Retry-After` tra 1 e 900.
- `blocked_email_is_blocked_even_with_the_right_password`.
- `another_email_is_not_affected`.
- `successful_login_resets_the_counter`: quattro errori, un successo, poi altri quattro errori senza 429.
- `libraries_and_login_share_the_counter`.
- `redeem_is_limited_globally`: dieci codici errati, l'undicesimo tentativo è 429 anche con un codice valido.
- `setup_code_guessing_is_limited`: con `CodeRequired`, cinque codici errati poi 429.
- `open_setup_is_not_limited`.
- `validation_errors_do_not_count`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test limits` passa con tutti i test elencati.
- `cargo test -p bookeeper-core --test auth_api --test pairing_api --test setup_api` passa senza modifiche a quei file.
- Solo `auth/limit.rs`, `state.rs`, `api/auth.rs`, `api/pairing.rs`, `api/setup.rs`, `tests/limits.rs` sono cambiati.
- La risposta 429 non rivela se l'email esiste.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
