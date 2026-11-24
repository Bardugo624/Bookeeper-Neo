Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Formattazione del codice Rust

## Obiettivo

La verifica dell'insieme esegue `cargo fmt --check` e oggi fallisce: alcuni file uniti da task precedenti non sono formattati (`crates/bookeeper-core/src/lookup/google.rs`, `src/lookup/mod.rs`, `tests/lookup_google.rs`, e forse altri arrivati dopo).

## Cosa fare

1. Esegui `cargo fmt --all` dalla root.
2. Non fare nessun'altra modifica: nessun cambio di logica, di nomi, di commenti, di test.

## Acceptance criteria

- `cargo fmt --all --check` esce con 0.
- `git diff --stat` contiene solo file `.rs`, e `git diff -w --stat` (che ignora gli spazi) mostra per ogni file solo righe spezzate o riunite: nessun identificatore, letterale o commento aggiunto o tolto.
- `cargo test -p bookeeper-core --test lookup_google --test lookup_api` passa ancora.
