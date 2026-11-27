Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Il file che si scarica», «Il gancio NSIS», «Mac: lo sfondo del DMG», «Release e CI»). Sono già unite:
- `setup-core-logic`, con il file d'esempio `crates/bookeeper-setup-core/tests/fixtures/tail.bin`;
- `setup-ui-shell`, con `apps/setup/package.json`;
- `setup-dmg`, con `apps/desktop/src-tauri/dmg/background.png`.

# Assemblaggio, gancio NSIS, configurazione dell'installer, download e versioni

## File
- Crea:
  - `scripts/setup/assemble.mjs` e `scripts/setup/assemble.test.mjs`;
  - `apps/desktop/src-tauri/windows/hooks.nsh` e `scripts/setup/hooks.test.mjs`.
- Modifica:
  - `apps/desktop/src-tauri/tauri.conf.json`;
  - `apps/desktop/package.json` e `package-lock.json`;
  - `scripts/r2/plan.mjs` e `scripts/r2/plan.test.mjs`;
  - `scripts/bk/commands/dist.mjs` e `scripts/bk/commands.test.mjs`;
  - `scripts/bk/version.mjs`, `scripts/bk/version.test.mjs` e `scripts/bk/commands/_testkit.mjs`;
  - `README.md`.

## Interfacce prodotte
- `assemble.mjs`, con la riga di comando, le esportazioni e l'uscita del contratto («Assemblaggio»). La task `setup-workflows` la usa nella release.
- `hooks.nsh`: il testo del design, con `!define BK_HOOKS_DIR "${__FILEDIR__}"` fuori dalle macro.

## Cosa fare
- **`assemble.mjs`:**
  - legge i tre file in streaming e calcola gli SHA-256 di installer e `bookeeper-desktop.exe`;
  - scrive Setup, installer, metadati e coda nel formato di `payload.rs`. `installed_bytes` è la dimensione di `bookeeper-desktop.exe` più quella del Setup leggero;
  - controlla che `--version` sia una versione valida e che i file esistano. Un errore esce con 2 e nomina l'argomento.
- **`tauri.conf.json` dell'app:**
  - `bundle.windows.nsis`: `installerHooks: "windows/hooks.nsh"`, `installMode: "currentUser"`;
  - `bundle.macOS.dmg`: `background: "dmg/background.png"`, `windowSize` 660×400, `appPosition` (180, 180), `applicationFolderPosition` (480, 180).
- **CLI:** `@tauri-apps/cli` esattamente `2.12.6` in `apps/desktop/package.json`; aggiorna `package-lock.json`.
- **Indice dei download** (`scripts/r2/plan.mjs`):
  - per `windows-x86_64`, `buildIndex` sceglie `Bookeeper-Setup-*.exe` se c'è, altrimenti l'installer NSIS come oggi;
  - `installerPlatform` riconosce `Bookeeper-Setup-2.2.0.exe` come `windows-x86_64`.
- **`bk dist`:** elenca e scarica anche `Bookeeper-Setup-*` (`gh release download … -p "Bookeeper_*" -p "Bookeeper-Setup-*"`). Il link per Windows è il Setup.
- **Versioni:**
  - `scripts/bk/version.mjs` aggiorna anche `apps/setup/package.json`;
  - `_testkit.mjs` lo copia fra i file di versione dei repository di prova.
- **`README.md`:** per Windows si scarica `Bookeeper-Setup-<versione>.exe`. L'installer classico resta nella release.

## Test
- **`node --test scripts/setup/assemble.test.mjs`:**
  - un Setup finto, un installer finto e un `bookeeper-desktop.exe` finto producono un file la cui coda `readTail` rilegge con gli SHA-256 giusti;
  - `readTail` legge anche `crates/bookeeper-setup-core/tests/fixtures/tail.bin`: lo stesso formato di Rust;
  - argomenti mancanti o una versione non valida danno 2.
- **`node --test scripts/setup/hooks.test.mjs`:**
  - `BK_HOOKS_DIR` è definito fuori dalle macro;
  - dentro le macro non compare `__FILEDIR__`;
  - `NSIS_HOOK_POSTINSTALL` scrive `UninstallString` = `"$INSTDIR\bookeeper-setup.exe" --uninstall` e `QuietUninstallString`, con `SetOverwrite try` prima di `File`;
  - `NSIS_HOOK_POSTUNINSTALL` cancella `bookeeper-setup.exe`.
- **`tauri.conf.json`:** un test (in `hooks.test.mjs`) legge il file e controlla `installerHooks`, `installMode` e la configurazione del DMG, e che il file dello sfondo esista.
- **`scripts/r2/plan.test.mjs`:** con l'installer NSIS e il Setup vince il Setup, in qualunque ordine; con il solo installer NSIS vince quello.
- **`scripts/bk/commands.test.mjs`:** `dist` mostra il Setup per Windows.
- **`scripts/bk/version.test.mjs`:** il cambio di versione aggiorna `apps/setup/package.json`.

## Acceptance criteria
- `npm run test:scripts` passa.
- Cambiano solo i file dichiarati.
