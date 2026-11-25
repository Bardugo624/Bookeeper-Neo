Leggi prima `docs/forge/fase-4a/CONTRATTO.md` e i contratti della fase 1 che cita. Leggi `crates/bookeeper-core/src/db/migrations/0001_schema.sql`, `src/db/mod.rs`, `src/api/mod.rs`, `src/openapi.rs`, `src/auth/guard.rs` e un modulo di rotte esistente con i suoi test (`src/api/wishlist.rs`, `tests/wishlist_api.rs`) per forma, errori, audit e isolamento.

# Core: registro attività e nomi dei prestiti

Implementa la sezione "Registro attività" del contratto, per intero.

## Punti da non sbagliare

- La task `filters-api` è già unita.
- `GET /audit` e `GET /audit/actions`: solo proprietario e admin (leggi i ruoli in `guard.rs`); gli altri → 403.
- `detail` è il JSON salvato in `detail_json`, restituito come oggetto; se non è JSON valido, `null`. `ip` non esce mai, nemmeno dentro `detail`: se una voce esistente lo contiene nel dettaglio, toglilo in uscita.
- Utente o dispositivo cancellati: `user`/`device` sono `null`, la voce resta.
- Filtri in AND; `from`/`to` inclusivi in secondi unix; `limit` predefinito 50, massimo 200 (di più → 422).
- Leggere il registro NON scrive una voce di registro.
- `GET /loans/borrowers`: nomi distinti senza distinguere le maiuscole, con la grafia più recente; `q` vuoto → i 10 più recenti; richiede lo stesso ruolo che può creare un prestito.

## Test

`tests/audit_api.rs`: elenco dal più recente; ogni filtro; intervallo di date; paginazione e `total`; `limit` oltre 200 → 422; ruolo non ammesso → 403; `ip` assente; utente cancellato → `null`; leggere non aggiunge voci; isolamento per libreria; `GET /audit/actions`.
`tests/loans_api.rs`: suggerimenti per prefisso, senza maiuscole, distinti, al più 10, i più recenti prima; isolamento.

## Acceptance criteria

- `cargo test -p bookeeper-core --test audit_api --test loans_api` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- `cargo test -p bookeeper-core --test openapi_errors` passa: ogni rotta nuova documenta gli errori che può dare.
- Cambiano solo: `crates/bookeeper-core/src/api/audit.rs`, `api/loans.rs`, `api/mod.rs`, `src/openapi.rs`, i test `audit_api.rs`, `loans_api.rs`.
