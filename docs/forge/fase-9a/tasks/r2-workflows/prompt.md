Leggi prima `docs/forge/fase-9a/CONTRATTO.md`, `docs/forge/fase-9a/request.md` e il design che citano. La task `r2-scripts` è già unita: i workflow chiamano `scripts/updates-r2.mjs`.

# Workflow: pubblicare su R2, ritirare, copiare, e un deploy della VPS solo a mano

**Attenzione.** Oggi un push sul ramo `claude/funny-bell-g5wrux` che tocca `ops/vps/deploy/**`, `ops/vps/run.sh` o un workflow `vps-*.yml` fa partire un deploy di produzione. Dopo questa task nessun workflow `vps-*.yml` ha un trigger `push`. Per gli eventi di push GitHub legge i workflow dal commit spinto, quindi il commit che porta queste modifiche non fa partire nulla. Un test lo garantisce. NON fare push: Forge non pubblica.

## File

- Modifica:
  - `.github/workflows/release.yml` (job `publish-updates`);
  - `.github/workflows/vps-deploy.yml`, `.github/workflows/vps-ops.yml`;
  - `ops/vps/run.sh`, `ops/vps/deploy/deploy.sh`;
  - `ops/vps/updates/README.md`.
- Crea:
  - `.github/workflows/updates.yml`;
  - `ops/vps/deploy/caddy.sh`, `ops/vps/deploy/bookeeper-r2.caddy`;
  - `scripts/workflows.test.mjs`;
  - se vuoi, `.github/actions/vps-ssh/action.yml`: un'azione composita per la preparazione SSH, che oggi è copiata in tre workflow.

## Cosa fare

1. **`release.yml`, job `publish-updates`:**
   - Scarica anche gli artifact `installers-*` in `installers/`.
   - Nell'ambiente:
     - `R2_ACCOUNT_ID: ${{ vars.R2_ACCOUNT_ID }}`, `R2_BUCKET: ${{ vars.R2_BUCKET }}`;
     - `AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}`, `AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}`;
     - `UPDATES_BASE: ${{ vars.UPDATES_BASE || 'https://updates.neokeeper.dev/v2' }}`, `UPDATES_REDIRECT: ${{ vars.UPDATES_REDIRECT }}`.
   - Il passo di controllo dà due uscite:
     - `r2=true` quando ci sono le quattro variabili R2 e gli artifact firmati;
     - `vps=true` quando c'è `VPS_SSH_KEY`, `UPDATES_REDIRECT` non è `on` e ci sono gli artifact firmati.
   - Per ciò che manca stampa un `::warning::`, con i nomi e mai i valori.
   - Il passo delle note (`release-notes.mjs`) gira se almeno una delle due uscite è vera.
   - Il passo R2: `node scripts/updates-r2.mjs publish --version "$VERSION" --updates updates --installers installers --notes-file release-notes.md --base "$UPDATES_BASE"`.
   - I passi della VPS restano come sono, con la condizione `vps == 'true'`.
2. **`updates.yml`, nuovo:**
   - Si avvia solo a mano, con gli input `action` (scelta: `seed`, `withdraw`), `channel` (scelta: `stable`, `beta`), `version` (testo) e `dry_run` (booleano, falso di default).
   - `concurrency.group: publish-updates`, lo stesso del job di `release.yml`, così non si scrivono manifest in contemporanea.
   - Fallisce subito se `github.ref` non è `refs/heads/main`.
   - `seed`:
     - preparazione SSH come in `release.yml`;
     - copia in sola lettura con `scp -r` di `vps:/opt/bookeeper/updates/{stable,beta,files}` in `seed/`;
     - poi `node scripts/updates-r2.mjs seed --from seed --from-base https://app.neokeeper.dev/updates --base "$UPDATES_BASE"`, con `--dry-run` se richiesto.
   - `withdraw`: `node scripts/updates-r2.mjs withdraw --channel … --version … --base "$UPDATES_BASE"`, con `--dry-run` se richiesto.
3. **`vps-deploy.yml`:**
   - Si avvia solo a mano, con l'input `target` (scelta: `server`, `caddy`; predefinito `server`).
   - Fallisce subito fuori da `main`.
   - Il sito di Caddy da installare è `ops/vps/deploy/bookeeper-r2.caddy` se `vars.UPDATES_REDIRECT == 'on'`, altrimenti `ops/vps/deploy/bookeeper.caddy`.
   - Con il rimando, prima di qualunque `ssh` o `scp`, deve riuscire `node scripts/updates-r2.mjs ready --base "$UPDATES_BASE" --vps https://app.neokeeper.dev/updates`.
   - `server` fa ciò che fa oggi:
     - immagine;
     - copia di `docker-compose.yml`, del sito scelto (come `bookeeper.caddy`), di `deploy.sh` e di `caddy.sh`;
     - `deploy.sh`.
   - `caddy` copia solo il sito scelto e `caddy.sh`, poi esegue `bash /opt/bookeeper/caddy.sh`. Niente immagine.
4. **`caddy.sh`:** è la parte Caddy di `deploy.sh`, spostata: backup, installazione, riga `import`, `cf.env`, validazione, ricarica oppure ripristino. `deploy.sh` la chiama dopo il container.
5. **`bookeeper-r2.caddy`:** lo stesso sito di `bookeeper.caddy`, ma il blocco `handle_path /updates/*` contiene solo `redir https://updates.neokeeper.dev/v2{uri} 302`.
6. **`vps-ops.yml` e `run.sh`:**
   - `vps-ops.yml` si avvia solo a mano.
   - `run.sh` diventa di sola lettura:
     - `docker ps -a`, `free -m`, `df -h /`;
     - una richiesta a `https://app.neokeeper.dev/updates/stable/latest.json` che stampa codice e destinazione del rimando.

     Non scrive nulla.
7. **`ops/vps/updates/README.md`:** spiega
   - la disposizione su R2;
   - la sequenza: `seed`, `ready`, la variabile `UPDATES_REDIRECT=on`, `vps-deploy` con `target=caddy`;
   - come tornare indietro (`UPDATES_REDIRECT=off`, poi `target=caddy`).

## Test (`scripts/workflows.test.mjs`)

Controlli sul testo dei file:
- Nel blocco `on:` di `vps-deploy.yml`, `vps-ops.yml` e `updates.yml` c'è `workflow_dispatch` e non ci sono `push`, `pull_request` né `schedule`.
- `vps-deploy.yml`:
  - ha `target` con `server` e `caddy`;
  - rifiuta i rami diversi da `main`;
  - nel percorso con il rimando, la riga di `ready` viene prima della prima riga con `ssh` o `scp`.
- `updates.yml`: usa `group: publish-updates` e rifiuta i rami diversi da `main`.
- `release.yml`: chiama `scripts/updates-r2.mjs publish`, e i passi della VPS dipendono dall'uscita che considera `UPDATES_REDIRECT`.
- `run.sh` non contiene comandi che scrivono: redirezioni `>` verso file, `install`, `cp`, `mv`, `rm`, `tee`, `systemctl reload|restart`.
- `bookeeper-r2.caddy`:
  - ha `redir https://updates.neokeeper.dev/v2{uri} 302` dentro `handle_path /updates/*`;
  - ha gli stessi indirizzi e lo stesso `reverse_proxy 127.0.0.1:7842` di `bookeeper.caddy`.
- Se `caddy` è sul `PATH`, `caddy adapt --config <file> --adapter caddyfile` riesce per i due siti; altrimenti il test si salta, dicendo perché.

## Acceptance criteria

- `npm run test:scripts` passa.
- Nessun workflow `vps-*.yml` ha un trigger `push`.
- Cambiano solo i file dichiarati.
