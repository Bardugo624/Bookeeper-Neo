Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Server: la pagina del motore si apre in una cornice

## File
- `crates/bookeeper-server/src/web.rs`.
- `crates/bookeeper-server/tests/web.rs`, nuovo.

## Regole
- `/reader-frame.html` risponde con `X-Frame-Options: SAMEORIGIN`. `layers.rs` mette `DENY` solo dove manca: basta impostarla in `web.rs` per quel file.
- Tutto il resto resta `DENY`.
- Il test non dipende dalla build del telefono: prova la funzione che costruisce la risposta di un file, con il nome `reader-frame.html` e con un altro nome.

## Passi
- [ ] Test, prima del codice:
  - `the_reader_frame_can_be_framed_by_the_same_site`;
  - `other_pages_still_refuse_frames`: con i livelli di `layers::apply`, `index.html` ha ancora `DENY`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.

## Acceptance criteria
- `cargo test -p bookeeper-server` e `cargo clippy -p bookeeper-server -- -D warnings` passano.
- `cargo fmt --all -- --check` passa.
