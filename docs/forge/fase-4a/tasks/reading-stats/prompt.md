Leggi prima `docs/forge/fase-4a/CONTRATTO.md` e i contratti della fase 1 che cita. Leggi `crates/bookeeper-core/src/db/migrations/0001_schema.sql`, `src/db/mod.rs`, `src/api/mod.rs`, `src/openapi.rs`, `src/auth/guard.rs` e un modulo di rotte esistente con i suoi test (`src/api/wishlist.rs`, `tests/wishlist_api.rs`) per forma, errori, audit e isolamento.

# Core: statistiche di lettura

Implementa la sezione "Statistiche di lettura" del contratto, per intero.

## Punti da non sbagliare

- La task `audit-api` è già unita.
- I confini di anno, mese e giorno si calcolano in UTC. Dichiaralo nella documentazione della rotta.
- `years`: tutti gli anni in cui chi chiama ha finito almeno un libro, dal più recente.
- `by_month` ha sempre 12 numeri; `days` contiene solo i giorni con almeno un libro.
- `by_genre`: raggruppato senza distinguere le maiuscole; libri senza genere sotto `value: null`.
- `rated.average` con una cifra decimale; `null` se nessuna valutazione.
- `year` non numerico o fuori da 1900..2200 → 422.
- Le statistiche esistenti (`GET /stats`) non cambiano.

## Test

`tests/reading_stats_api.rs`: anno senza letture (zeri e `longest: null`); libri finiti a cavallo di capodanno in UTC; `by_month`; `days`; `by_genre` con genere assente e maiuscole miste; pagine con `page_count` assente; valutazioni; `longest`; due utenti con statistiche diverse; isolamento; `year` non valido.
`tests/stats_api.rs`: resta verde senza modifiche.

## Acceptance criteria

- `cargo test -p bookeeper-core --test reading_stats_api --test stats_api` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- `cargo test -p bookeeper-core --test openapi_errors` passa: ogni rotta nuova documenta gli errori che può dare.
- Cambiano solo: `crates/bookeeper-core/src/api/stats.rs`, `api/mod.rs`, `src/openapi.rs`, i test `stats_api.rs`, `reading_stats_api.rs`.
