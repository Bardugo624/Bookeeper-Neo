Leggi prima `docs/forge/fase-9b/CONTRATTO.md` e il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Release e CI», «Mac: lo sfondo del DMG», «Modalità silenziosa»). Sono già unite `setup-app` (il Setup e `--smoke-ui`) e `setup-assemble` (`scripts/setup/assemble.mjs`, il gancio, la configurazione del DMG).

# Release e CI: costruire, assemblare e provare il Setup

## File
- Modifica:
  - `.github/workflows/release.yml`;
  - `.github/workflows/ci.yml`;
  - `scripts/workflows.test.mjs`.
- Crea `scripts/setup/smoke.ps1`.

## Cosa fare
- **`release.yml`, job `check`:** controlla anche che `apps/setup/package.json` abbia la versione del workspace.
- **`release.yml`, job `desktop`, solo su Windows:**
  1. **Prima di `Build`:** costruisci il Setup leggero con `npm run tauri -w @bookeeper/setup -- build --no-bundle --target "$TARGET"` e copia `bookeeper-setup.exe` in `apps/desktop/src-tauri/windows/bookeeper-setup.exe`. Se il file non c'è, il job si ferma con un errore chiaro.
  2. **Dopo `Collect`:** assembla `out/installers/Bookeeper-Setup-${VERSION}.exe` con `assemble.mjs`:
     - Setup: il file copiato al passo 1;
     - installer: il `*-setup.exe` della cartella `bundle/nsis`;
     - eseguibile: `bookeeper-desktop.exe` di `target/<TARGET>/release`.
  3. **Prova di fumo:** `pwsh scripts/setup/smoke.ps1 -Setup <Setup completo> -Classic <installer NSIS> -Main <bookeeper-desktop.exe della build>`, con `BOOKEEPER_SETUP_ALLOW_ELEVATED=1` (i runner di GitHub girano da amministratore). Se fallisce, il job fallisce e la release non si pubblica.
  4. **Dipendenze DLL:** stampa `dumpbin /dependents` del Setup leggero, trovando `dumpbin` con `vswhere`. Serve solo da informazione: se `dumpbin` manca, è un avviso.
- **`release.yml`, job `desktop`, solo su macOS:**
  - `TAURI_BUNDLER_DMG_IGNORE_CI: "true"`;
  - un passo prima di `Build` unisce `dmg/background.png` e `dmg/background@2x.png` in `dmg/background.tiff` con `tiffutil -cathidpicheck`;
  - entrambi i rami di `Build` aggiungono `{"bundle":{"macOS":{"dmg":{"background":"dmg/background.tiff"}}}}` al `--config` (unito a quello della chiave degli aggiornamenti, dove c'è);
  - se la build fallisce, si riprova una volta.
- **`release.yml`, job `release`:** `sha256sum` e `files:` comprendono anche `Bookeeper-Setup-*`.
- **`ci.yml`, job `desktop-build` (Windows):** aggiungi
  - `cargo clippy -p bookeeper-setup-core -p bookeeper-setup --all-targets -- -D warnings`;
  - `cargo test -p bookeeper-setup-core -p bookeeper-setup`.
- **`scripts/setup/smoke.ps1`**, in PowerShell 7:
  - aspetta ogni processo con `Start-Process -Wait -PassThru` e controlla il codice d'uscita;
  - passa a `Start-Process` un'unica stringa di argomenti, così gli spazi arrivano come sono.

  Passi, nella cartella `C:\Prova Bookeeper\Libreria è`:
  1. `--smoke-ui` esce con 0.
  2. `--quiet "--dir=<cartella>"` esce con 0. Poi controlla:
     - ci sono `bookeeper-desktop.exe`, `bookeeper-setup.exe` e `uninstall.exe`, e `bookeeper-desktop.exe` ha lo stesso SHA-256 del file passato con `-Main`;
     - `UninstallString` è `"<cartella>\bookeeper-setup.exe" --uninstall`;
     - ci sono i collegamenti nel menu Start e sul desktop.
  3. L'installer classico con `/P /UPDATE` sopra l'installazione esce con 0, e `UninstallString` resta quello del passo 2.
  4. Come la pagina di NSIS: `"<cartella>\bookeeper-setup.exe"` con `--uninstall /P _?=<cartella>` esce con 0 solo a lavoro fatto: `bookeeper-desktop.exe` non c'è più subito dopo il ritorno.
  5. Reinstalla. Crea `%APPDATA%\org.bookeeper.desktop\bookeeper.sqlite` finto e due credenziali generiche con `cmdkey /generic:<nome>.org.bookeeper.desktop`. Disinstalla con `--uninstall --quiet`: i dati e le credenziali restano.
  6. Reinstalla. Disinstalla con `--uninstall --quiet --delete-data`. Poi:
     - le due cartelle dei dati e le credenziali con il suffisso non ci sono più;
     - `HKCU\Software\bookeeper\Bookeeper` e `Run\Bookeeper` non ci sono più;
     - la cartella d'installazione non c'è più (attendi fino a 10 s per la cancellazione di sé).

  Ogni controllo che fallisce stampa cosa si aspettava e cosa ha trovato, poi esce con 1.

## Test (`node --test scripts/workflows.test.mjs`)
- `release.yml`:
  - il Setup leggero si costruisce e si copia prima di `Build`, solo su Windows;
  - l'assemblaggio sta dopo `Collect`;
  - la prova di fumo ha `BOOKEEPER_SETUP_ALLOW_ELEVATED`;
  - su macOS ci sono `TAURI_BUNDLER_DMG_IGNORE_CI` e `tiffutil`, e la TIFF è in entrambi i rami;
  - `sha256sum` e `files:` comprendono `Bookeeper-Setup-*`;
  - il controllo della versione legge `apps/setup/package.json`.
- `ci.yml`: il job Windows lancia `clippy` e `test` dei due crate del Setup.
- I test di oggi restano verdi: nessun `vps-*.yml` con `push`, R2 e VPS come prima.
- `smoke.ps1`: contiene i sei passi, la cartella con lo spazio e la lettera accentata, e `-Wait -PassThru`. È un controllo statico: qui non c'è PowerShell.

## Acceptance criteria
- `npm run test:scripts` passa.
- `actionlint`, se c'è sulla macchina, non segnala errori nei due workflow.
- Cambiano solo i file dichiarati. Nessun workflow `vps-*.yml` toccato.
