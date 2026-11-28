Leggi prima `docs/forge/fase-10b1/CONTRATTO.md`.

# Server: il test della cornice senza i test doppi

## File
`crates/bookeeper-server/tests/web.rs`, `src/web.rs`, `src/lib.rs` e, se serve, `src/layers.rs`.

## Cosa fare
- `tests/web.rs` include `../src/layers.rs` con `#[path]`, così i test interni di `layers.rs` girano due volte.
- Il test usa invece l'API pubblica del crate: per esempio il router con i livelli, oppure una funzione pubblica che costruisce le intestazioni di un file.
- Il comportamento non cambia: `reader-frame.html` ha `X-Frame-Options: SAMEORIGIN`, il resto `DENY`.

## Acceptance criteria
- `cargo test -p bookeeper-server` passa, e `a_500_is_logged_once_at_error` gira una volta sola.
- `cargo clippy -p bookeeper-server --all-targets -- -D warnings` e `cargo fmt --all -- --check` passano.
