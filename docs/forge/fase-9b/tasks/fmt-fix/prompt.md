Leggi prima `docs/forge/fase-9b/CONTRATTO.md`.

# Formattazione del codice Rust

## Obiettivo
La verifica dell'insieme esegue `cargo fmt --check` e oggi fallisce. I file Rust uniti dalle task precedenti non sono formattati: `crates/bookeeper-setup-core/`, `apps/setup/src-tauri/`, `apps/desktop/src-tauri/src/autostart.rs` e `apps/desktop/src-tauri/tests/startup.rs`.

## Cosa fare
1. Esegui `cargo fmt --all` dalla radice.
2. Non fare nessun'altra modifica: niente cambi di logica, nomi, commenti o test.

## Acceptance criteria
- `cargo fmt --all --check` esce con 0.
- `git diff --stat` contiene solo file `.rs`.
- `git diff -w` (che ignora gli spazi) mostra per ogni file solo righe spezzate o riunite: nessun identificatore, letterale o commento aggiunto o tolto.
- `cargo test -p bookeeper-setup-core -p bookeeper-setup` passa ancora.
