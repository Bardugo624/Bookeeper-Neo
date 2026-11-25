Leggi prima `docs/forge/fase-2d/CONTRATTO.md` e i contratti che cita: regole, nomi e aspetto valgono anche qui. La task `updater` è già unita. Leggi `.github/workflows/release.yml` (oggi: binari del server e immagine Docker), `.github/workflows/vps-deploy.yml` (come si entra in SSH sulla VPS) e `ops/vps/deploy/`.

# Rilascio desktop: installer, manifest, pubblicazione

Segui la sezione "Rilascio desktop" del contratto.

## Cosa fare

1. **`tauri.conf.json`**: `bundle.createUpdaterArtifacts: true`; obiettivi NSIS, DMG, AppImage, deb.
2. **`release.yml`**, job nuovo `desktop` (matrice: `windows-latest`, `macos-latest` per arm64 e x86_64, `ubuntu-22.04`), dopo `check`: librerie di sistema su Linux; `npm ci`; build con la CLI di Tauri (`npm run tauri build -w @bookeeper/desktop -- --target …`). Variabili: `BOOKEEPER_UPDATER_PUBKEY` da `vars`, `TAURI_SIGNING_PRIVATE_KEY` e `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` da `secrets`. Se il secret della chiave manca: build con `createUpdaterArtifacts` disattivato da riga di comando (`--config`) e un avviso `::warning::`. Carica come artefatti gli installer e, se esistono, gli artefatti di aggiornamento con le firme `.sig`.
   La versione del pacchetto viene dalla versione dell'area di lavoro: se `tauri.conf.json` e `Cargo.toml` divergono, il job `check` fallisce.
3. **`scripts/update-manifest.mjs`** (Node, senza dipendenze): dati una cartella di artefatti, la versione, le note e l'indirizzo di base, scrive `latest.json` nel formato dell'updater di Tauri v2 (`version`, `notes`, `pub_date`, `platforms` con `signature` e `url` per `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`). Riconosce gli artefatti dal nome e dall'estensione; una piattaforma senza firma è omessa con un avviso; nessuna piattaforma → errore. Canale dal suffisso della versione.
4. **Job `publish-updates`** (solo su tag, solo se esistono artefatti di aggiornamento e il secret `VPS_SSH_KEY`): scarica gli artefatti, genera il manifest, copia sulla VPS in `/opt/bookeeper/updates/files/<versione>/`, poi scrive `/opt/bookeeper/updates/<canale>/latest.json` in modo atomico (file temporaneo e `mv`); una stabile aggiorna anche `beta`. Stessa preparazione SSH di `vps-deploy.yml`, con la stessa impronta dell'host. Tiene le ultime 3 versioni in `files/`.
5. **Job `release`** esistente: aggiunge gli installer desktop ai file della release.
6. **Caddy**: NON toccare nulla sotto `ops/vps/deploy/` (un push su quella cartella avvia un deploy sulla VPS). Scrivi invece `ops/vps/updates/bookeeper.caddy`: la versione completa del sito di `app.neokeeper.dev` e `mobile.neokeeper.dev` (copia quella di `ops/vps/deploy/bookeeper.caddy`) con in più un blocco `handle_path /updates/*` che serve i file da `/opt/bookeeper/updates` in sola lettura (`file_server`, senza elenco delle cartelle; `Cache-Control: no-cache` per `latest.json`, lunga per `files/`), prima del `reverse_proxy`. Aggiungi `ops/vps/updates/README.md` con la struttura delle cartelle. L'applicazione sulla VPS la decide il proprietario.

## Test

`scripts/update-manifest.test.mjs` con `node --test`: manifest completo da una cartella finta con i quattro artefatti e le firme; piattaforma senza firma omessa; nessuna piattaforma → codice d'uscita diverso da zero; canale da `2.0.0-beta.1` e da `2.0.0`; indirizzi con la base data e la versione nel percorso; note con a capo e virgolette conservate nel JSON.

## Acceptance criteria

- `node --test scripts/update-manifest.test.mjs` passa.
- I file di workflow sono YAML valido (`python3 -c "import yaml,sys; [yaml.safe_load(open(f)) for f in sys.argv[1:]]" .github/workflows/release.yml`).
- `npm run build -w @bookeeper/desktop` e `cargo build -p bookeeper-desktop` passano con il `tauri.conf.json` nuovo.
- `caddy fmt` non è disponibile qui: controlla a mano le parentesi del frammento Caddy e dichiaralo.
- Cambiano solo: `.github/workflows/release.yml`, `apps/desktop/src-tauri/tauri.conf.json`, `scripts/update-manifest.mjs`, `scripts/update-manifest.test.mjs`, file sotto `ops/vps/updates/`.
