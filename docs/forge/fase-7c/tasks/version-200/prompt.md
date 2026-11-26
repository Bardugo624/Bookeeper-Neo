Leggi prima `docs/forge/fase-7c/CONTRATTO.md`, `CHANGELOG.md`, `Cargo.toml`, `apps/desktop/src-tauri/tauri.conf.json` e il job `check` di `.github/workflows/release.yml`.

# Versione 2.0.0

## Cosa fare

1. **Versione**: `2.0.0` in `Cargo.toml` (`[workspace.package]`), in `apps/desktop/src-tauri/tauri.conf.json` e nel campo `version` di `apps/desktop/package.json`, `apps/mobile/package.json`, `packages/api/package.json`, `packages/i18n/package.json`, `packages/ui/package.json`. `Cargo.lock` e `package-lock.json` si aggiornano con gli strumenti (`cargo build`, `npm install --package-lock-only`), non a mano. L'istantanea `packages/api/openapi.json` si rigenera con `UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi`.
2. **Versioni nei test**: i valori scritti nei test come dati di prova (per esempio `2.0.0-dev` in un oggetto finto) restano come sono. Si cambia un test solo se confronta la versione vera del pacchetto.
3. **`CHANGELOG.md`**: il titolo della sezione diventa `## [2.0.0] - 2026-11-26`. Rileggi la sezione contro ciò che la 2.0 contiene davvero (design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md`, §7, e i run della fase 7: prestazioni con 10.000 libri, contrasto e tema scuro, rimozione della 0.3) e completa ciò che manca, nello stesso stile e nelle stesse sezioni. Il testo DEVE restare dentro ciò che l'interprete di "Vedi novità" sa mostrare (vedi il contratto): niente tabelle, niente immagini, niente HTML. Le sezioni delle versioni passate non si toccano.

## Acceptance criteria

- Il job `check` di `release.yml`, eseguito a mano sul tuo albero (la stessa lettura di `Cargo.toml` e `tauri.conf.json`), trova `2.0.0` in entrambi.
- `cargo fmt --check`, `cargo test -p bookeeper-core` e `cargo test -p bookeeper-server` passano.
- `npm test` dalla radice passa; `npm run build -w @bookeeper/desktop -w @bookeeper/mobile` passa.
- Cambiano solo: `Cargo.toml`, `Cargo.lock`, `apps/desktop/src-tauri/tauri.conf.json`, i cinque `package.json` nominati, `package-lock.json`, `packages/api/openapi.json`, `CHANGELOG.md`.
