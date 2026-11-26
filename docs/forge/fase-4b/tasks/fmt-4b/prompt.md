Leggi prima `docs/forge/fase-4a/CONTRATTO.md`.

# Formattazione dei file del core

La verifica del run fallisce su `cargo fmt --check`: `crates/bookeeper-core/tests/books_search_api.rs` non è formattato come vuole `rustfmt`.

## Cosa fare

Esegui `cargo fmt --check`, poi `rustfmt --edition 2021` su ogni file che segnala sotto `crates/bookeeper-core/`. Nessuna modifica di comportamento: solo spazi e a capo. Elenca i file nel rapporto.

## Acceptance criteria

- `cargo fmt --check` passa.
- `cargo test -p bookeeper-core --test books_search_api` passa.
- `git diff -w` non mostra differenze di contenuto oltre agli a capo; cambiano solo file sotto `crates/bookeeper-core/`.
