Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Correggere i difetti P3 del run 1A

## Obiettivo

Chiudere i difetti che il revisore del run 1A ha confermato sotto la soglia di blocco. Sei correzioni piccole, ognuna con il suo test.

## Correzioni

1. **Il limite di tentativi regge alle raffiche** (`auth/limit.rs`, usato in `api/auth.rs`, `api/pairing.rs`, `api/setup.rs`). Oggi `check` e `record_failure` sono due passi separati con Argon2 in mezzo: 50 login simultanei passano tutti. Sostituisci la coppia con una prenotazione atomica:

   ```rust
   /// Prenota un tentativo. Err(retry_after_secs) se, contando anche i tentativi in corso, il limite è raggiunto.
   pub fn begin(&self, key: &str, rule: Rule, now: i64) -> Result<Attempt<'_>, u64>;

   impl Attempt<'_> {
       pub fn succeeded(self);   // azzera la chiave
       pub fn failed(self);      // il tentativo resta contato come fallimento
       pub fn neutral(self);     // libera la prenotazione senza contarla (422, 409, 5xx)
   }
   // Drop senza esito = neutral, così un errore a metà non blocca nessuno.
   ```

   Sotto un unico lock: conta fallimenti nella finestra più prenotazioni aperte; se sono già `max_failures` → `Err`. `check` e `record_failure` spariscono dall'uso nelle rotte (possono restare come dettagli interni). Le regole su cosa conta come fallimento non cambiano. `Attempt` deve poter attraversare un `.await`: niente guardie di mutex tenute dentro.

2. **Password troppo corta al login** (`api/auth.rs`): `POST /auth/login` e `POST /auth/libraries` validano `password` (8–256) prima di tutto → 422 `validation`, senza contare come tentativo.

3. **Cambio password senza email** (`api/auth.rs`): `POST /auth/password` risponde 422 `validation` ogni volta che l'utente non ha un'email, anche se ha già una password.

4. **Corpo troppo grande** (`extract.rs`): un corpo oltre il limite di axum → 413 `payload_too_large`, non 400.

5. **Transazione di setup** (`api/setup.rs`): usa `conn.transaction_with_behavior(TransactionBehavior::Immediate)` al posto di `BEGIN`/`COMMIT`/`ROLLBACK` a mano. Il comportamento visibile non cambia.

6. **Pulizia** (`api/pairing.rs`): togli i due blocchi annidati inutili in `redeem_in_tx`. Nessun cambio di comportamento.

## Test

In `tests/limits.rs` (aggiungi; i test esistenti restano, adattati alla nuova interfaccia solo dove usano `check`/`record_failure` direttamente):
- `begin_counts_in_flight_attempts`: con `max_failures: 3`, tre `begin` senza esito riescono, il quarto dà `Err`.
- `neutral_and_drop_release_the_reservation`.
- `failed_keeps_the_slot_and_succeeded_clears_the_key`.
- `burst_of_wrong_logins_is_capped`: 30 `POST /auth/login` simultanei (`futures`-free: usa `tokio::task::JoinSet`) con password errata per la stessa email → al più 5 risposte 401, le altre 429.
- `burst_of_wrong_redeems_is_capped`: 30 riscatti simultanei con codici errati → al più 10 risposte 401.

In `tests/auth_api.rs` (aggiungi):
- `short_password_at_login_is_validation`: 422, e dopo sei tentativi così il login giusto funziona ancora (non contano).
- `changing_password_without_email_is_validation_even_with_a_password`.

In `tests/skeleton.rs` (aggiungi):
- `oversized_body_is_payload_too_large`: un corpo JSON di 3 MB → 413 `payload_too_large`, `content-type: application/json`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test limits --test auth_api --test skeleton --test setup_api --test pairing_api` passa, con i test nuovi e tutti quelli vecchi.
- `burst_of_wrong_logins_is_capped` passa 20 volte di fila.
- `grep -n "BEGIN\|COMMIT\|ROLLBACK" crates/bookeeper-core/src/api/setup.rs` non trova nulla.
- Cambiano solo: `auth/limit.rs`, `api/auth.rs`, `api/pairing.rs`, `api/setup.rs`, `extract.rs` e i quattro file di test citati.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
