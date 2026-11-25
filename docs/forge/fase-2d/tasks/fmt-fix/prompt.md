Leggi prima `docs/forge/fase-2d/CONTRATTO.md`.

# Formattazione dei file della condivisione in rete

La verifica del run fallisce su `cargo fmt --check`: `apps/desktop/src-tauri/tests/sharing.rs` (e forse `apps/desktop/src-tauri/src/sharing.rs`) non sono formattati come vuole `rustfmt`.

## Cosa fare

`rustfmt --edition 2021` sui due file. Nessuna modifica di comportamento: solo spazi e a capo. Poi controlla con `cargo fmt --check` che l'intero workspace sia pulito; se segnala altri file sotto `apps/desktop/src-tauri/`, formattali allo stesso modo ed elencali nel rapporto.

## Acceptance criteria

- `cargo fmt --check` passa.
- `cargo test -p bookeeper-desktop --test sharing` passa.
- `git diff --stat` mostra solo file sotto `apps/desktop/src-tauri/`, e `git diff -w` (ignorando gli spazi) non mostra differenze di contenuto oltre agli a capo.
