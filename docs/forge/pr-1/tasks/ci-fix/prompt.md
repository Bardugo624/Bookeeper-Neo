Leggi prima `docs/forge/fase-1d/CONTRATTO.md` (regole su `Cargo.toml` e sui workflow).

# CI: test Rust senza esaurire il disco, dipendenze inutilizzate

## 1. Job `rust` di `.github/workflows/ci.yml`

`cargo test --workspace` collega decine di binari di test con le informazioni di debug complete e il runner esaurisce il disco: `ld terminated with signal 7 [Bus error]` sul test `pairing_api` di `bookeeper-core`.

Regola: a livello di job, `env` con `CARGO_PROFILE_DEV_DEBUG: "0"`, `CARGO_PROFILE_TEST_DEBUG: "0"` e `CARGO_INCREMENTAL: "0"`. Stesse variabili nel job `openapi` e nel job `desktop-build`. Prima dei passi di Rust nel job `rust`, un passo che libera spazio rimuovendo strumenti che il job non usa (`/usr/share/dotnet`, `/usr/local/lib/android`, `/opt/ghc`) e stampa `df -h /` prima e dopo. Nessun'altra modifica al workflow: i comandi `cargo fmt --check`, `cargo clippy --workspace --all-targets -- -D warnings` e `cargo test --workspace` restano identici.

## 2. Dipendenze inutilizzate

Cargo segnala `printpdf` in `crates/bookeeper-core/Cargo.toml`, `hex` e `tracing` in `crates/bookeeper-net/Cargo.toml`. Verifica con una ricerca nel codice (sorgenti, test, `build.rs`, funzioni condizionali) che non siano usate; rimuovi quelle davvero inutilizzate e aggiorna `Cargo.lock` con `cargo build --workspace`. Se una è usata, lasciala e spiega dove.

## Acceptance criteria

- Il workflow è YAML valido: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"`.
- `CARGO_PROFILE_DEV_DEBUG=0 CARGO_PROFILE_TEST_DEBUG=0 cargo test -p bookeeper-core --test pairing_api --test labels_api` passa.
- `cargo test -p bookeeper-net` passa; `cargo clippy --workspace --all-targets -- -D warnings` passa.
- `cargo build --workspace 2>&1 | grep -c "unused dependency"` dà 0.
- `cargo tree -i aws-lc-rs`, `-i aws-lc-sys`, `-i openssl-sys` non trovano nulla.
- Cambiano solo: `.github/workflows/ci.yml`, `crates/bookeeper-core/Cargo.toml`, `crates/bookeeper-net/Cargo.toml`, `Cargo.lock`.
