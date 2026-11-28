Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`. La task `local-auth` è già unita.

# Computer: il file del libro e i collegamenti esterni

## File
- `apps/desktop/src-tauri/src/reader.rs`, nuovo, e `src/lib.rs`.
- `apps/desktop/src-tauri/tauri.conf.json` e `capabilities/default.json`.
- `apps/desktop/src-tauri/Cargo.toml` e `Cargo.lock`.
- `apps/desktop/src-tauri/tests/reader.rs`, nuovo.
- `apps/desktop/src/platform/`: i tipi, `tauri.ts`, `browser.ts` e i finti di `testing.ts`.
- `apps/desktop/package.json` e `package-lock.json`, per `@tauri-apps/plugin-opener`.

## Cosa fare
- **Il comando `reader_file`**, come nel contratto:
  - usa lo streaming di `download.rs`, per una libreria locale e per un server;
  - controlla che lo sha256 sia quello atteso: se no, cancella e dà errore;
  - tiene i 10 file usati più di recente.
- **`tauri.conf.json`:** protocollo `asset` attivo, con scope `$APPCACHE/reader/**`; la feature `protocol-asset` di `tauri`.
- **Il plugin opener**, con il permesso solo per `https://duckduckgo.com/*`.
- **La piattaforma** riceve due metodi:
  - `readerFile(args)`, che restituisce l'URL da leggere (`convertFileSrc` del percorso);
  - `openUrl(url)`.

  Nel browser di sviluppo, `readerFile` usa il contenuto dall'API e `openUrl` usa `window.open`.

## Passi
- [ ] Test, prima del codice:
  - Rust: `reader_file_copies_once_and_reuses`, con una libreria locale e una sessione vera; `the_cache_keeps_ten_files`; `a_wrong_sha_is_refused_and_nothing_stays`; `a_remote_library_streams_the_file`, con un server di prova come in `tests/remote.rs`;
  - TS: `reader_file_invokes_the_command_and_returns_an_asset_url`; `open_url_uses_the_opener`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.

## Acceptance criteria
- `cargo test -p bookeeper-desktop`, `cargo clippy -p bookeeper-desktop -- -D warnings`, `npm test -w apps/desktop` e `npm run typecheck -w apps/desktop` passano.
- `cargo fmt --all -- --check` passa.
