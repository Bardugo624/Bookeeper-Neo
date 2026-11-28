Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Release e CI», «Scelte mie»). La task `setup-ui-shell` è già unita: `apps/setup/package.json` esiste.

# Download e versioni: il Setup è il link per Windows

## File
- Modifica:
  - `scripts/r2/plan.mjs` e `scripts/r2/plan.test.mjs`;
  - `scripts/bk/commands/dist.mjs` e `scripts/bk/commands.test.mjs`;
  - `scripts/bk/version.mjs`, `scripts/bk/version.test.mjs` e `scripts/bk/commands/_testkit.mjs`;
  - `README.md`.

## Cosa fare
- **Indice dei download** (`scripts/r2/plan.mjs`):
  - per `windows-x86_64`, `buildIndex` sceglie `Bookeeper-Setup-*.exe` se c'è, altrimenti l'installer NSIS come oggi;
  - `installerPlatform` riconosce `Bookeeper-Setup-2.2.0.exe` come `windows-x86_64`.
- **`bk dist`:** elenca e scarica anche `Bookeeper-Setup-*` (`gh release download … -p "Bookeeper_*" -p "Bookeeper-Setup-*"`). Il link per Windows è il Setup.
- **Versioni:**
  - `scripts/bk/version.mjs` aggiorna anche `apps/setup/package.json`;
  - `_testkit.mjs` lo copia fra i file di versione dei repository di prova.
- **`README.md`:** per Windows si scarica `Bookeeper-Setup-<versione>.exe`. L'installer classico resta nella release, per chi lo preferisce.

## Test
- **`scripts/r2/plan.test.mjs`:** con l'installer NSIS e il Setup vince il Setup, in qualunque ordine; con il solo installer NSIS vince quello.
- **`scripts/bk/commands.test.mjs`:** `dist` mostra il Setup per Windows, e con `--download` chiede entrambi i modelli.
- **`scripts/bk/version.test.mjs`:** il cambio di versione aggiorna `apps/setup/package.json`.

## Acceptance criteria
- `npm run test:scripts` passa.
- Cambiano solo i file dichiarati.
