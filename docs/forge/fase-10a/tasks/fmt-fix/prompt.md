Leggi prima `docs/forge/fase-10a/CONTRATTO.md`.

# Formattazione di tests/backup.rs

## Obiettivo
La verifica dell'insieme esegue `cargo fmt --check` e oggi fallisce su `crates/bookeeper-core/tests/backup.rs`, unito dalla task `ebook-backup`: una riga va spezzata.

## Cosa fare
1. Esegui `cargo fmt --all` dalla radice.
2. Non fare nessun'altra modifica: niente cambi di logica, nomi, commenti o test.

## Acceptance criteria
- `cargo fmt --all -- --check` esce con 0.
- `git diff --stat` contiene solo `crates/bookeeper-core/tests/backup.rs`.
- `git diff -w` mostra solo righe spezzate o riunite: nessun identificatore, letterale o commento aggiunto o tolto.
- `cargo test -p bookeeper-core --test backup` passa ancora.
