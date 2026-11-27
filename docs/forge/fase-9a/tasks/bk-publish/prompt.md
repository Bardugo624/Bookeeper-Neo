Leggi prima `docs/forge/fase-9a/CONTRATTO.md`, `docs/forge/fase-9a/request.md` e il design che citano. Le task `bk-version`, `bk-core`, `r2-scripts` e `r2-workflows` sono già unite.

# Lo script `bk`: build, release, aggiornamenti e deploy

## File

- Crea `scripts/bk/commands/build.mjs`, `release.mjs`, `updates.mjs`, `deploy.mjs` e i loro test `scripts/bk/commands/*.test.mjs`.
- Modifica `scripts/bk.mjs` (registra i comandi) e `docs/bk.md` (aggiungi questi comandi).

## Interfacce usate

- Da `bk-core`: `BkError`; `gh`, `findRun`, `watch`; `branch`, `isClean`, `isPushed`, `shortSha`, `commit`, `push`; `channelVersions`, `serverVersion`; `choose`, `confirm`.
- Da `bk-version`: `readVersion`, `bumpVersion`, `ensureChangelog`; `inc`, `compare`, `parse`.
- Da `r2-workflows`:
  - `release.yml`, input `publish`;
  - `updates.yml`, input `action`, `channel`, `version`, `dry_run`;
  - `vps-deploy.yml`, input `target`;
  - la variabile `UPDATES_REDIRECT`.
- Da `r2-scripts`: `node scripts/updates-r2.mjs ready`, lanciato con `process.execPath`.

## Comandi

### `build`

- L'albero deve essere pulito e il ramo già su GitHub. Va bene qualunque ramo.
- Avvia `gh workflow run release.yml --ref <ramo> -f publish=false`, poi `findRun` e `watch`.
- Se riesce, chiede «Scarico gli installer in dist/?». Se sì: `gh run download <id> -p "installers-*" -D dist/<versione>-<sha>`.

### `release <patch|minor|major|beta|x.y.z>`

1. **Controlli:**
   - il ramo è `main`;
   - l'unico file cambiato può essere `CHANGELOG.md` (`isClean(['CHANGELOG.md'])`);
   - il ramo è già su GitHub.
2. **Nuova versione:** con `inc(readVersion(root), kind)`, oppure quella scritta, che deve essere valida e più alta dell'attuale.
3. **Prima di cambiare qualunque cosa:**
   - la nuova versione deve essere più alta di quelle pubblicate su tutti e due i canali (`channelVersions`);
   - `gh release view v<nuova>` deve fallire. Se riesce: `BkError('La release v<nuova> esiste già su GitHub', 'Guarda il run interrotto: npm run bk -- ci')`.
4. **Note di versione:** `ensureChangelog(root, nuova, oggi)`.
   - Se la sezione mancava: stampa «Ho aggiunto la sezione <nuova> in CHANGELOG.md: scrivi le novità, poi rilancia npm run bk -- release <nuova>». Poi esce con 0 senza cambiare versioni.
   - Se la sezione c'è ma ha solo il segnaposto (`-` vuoto): `BkError` che chiede di scriverla.
5. **Commit e pubblicazione:**
   - `bumpVersion(root, nuova)`, poi `commit([...file, 'CHANGELOG.md'], 'Release <nuova>')` e `push()`;
   - `gh workflow run release.yml --ref main -f publish=true`, poi `findRun` e `watch`;
   - se fallisce: `BkError` con l'URL del run e il suggerimento `npm run bk -- ci logs <id>`.
6. **Verifica:** ogni 20 s, per al massimo 15 minuti, controlla che il canale della nuova versione la mostri (`channelVersions`). Poi stampa l'URL della release (`gh release view v<nuova> --json url`).

### `updates`

| Forma | Cosa fa |
|---|---|
| `updates` | Mostra i due canali, la fonte e lo stato del rimando (`gh variable get UPDATES_REDIRECT`). |
| `updates seed` | Chiede conferma, poi `gh workflow run updates.yml --ref main -f action=seed`, e segue il run. |
| `updates withdraw <canale> <versione>` | Chiede conferma scrivendo `ritira`, poi avvia `action=withdraw` con `channel` e `version`, segue il run e mostra il canale. |
| `updates switch` | Vedi sotto. |
| `updates switch --off` | Chiede conferma scrivendo `deploy`, poi variabile `off`, deploy `target=caddy`. Alla fine controlla che la VPS risponda 200. |

`updates switch`, nell'ordine:
1. lancia `ready`. Se fallisce: `BkError('R2 non è pronto: il rimando resta spento')`, con i motivi, e non cambia nulla;
2. chiede conferma scrivendo `deploy`;
3. `gh variable set UPDATES_REDIRECT --body on`;
4. `gh workflow run vps-deploy.yml --ref main -f target=caddy`, poi `watch`;
5. controlla che `https://app.neokeeper.dev/updates/stable/latest.json`, chiesto con `redirect: 'manual'`, risponda 302 verso `https://updates.neokeeper.dev/v2/`;
6. se il deploy fallisce, rimette la variabile a `off` e lo dice.

### `deploy <server|caddy>`

- Controlli: `main`, albero pulito, ramo già su GitHub.
- Chiede SEMPRE conferma scrivendo `deploy`: non esiste un'opzione per saltarla.
- Avvia `gh workflow run vps-deploy.yml --ref main -f target=<target>`, poi `watch`.
- Verifica:
  - con `server`, `serverVersion()` deve essere uguale a `readVersion(root)`, entro 2 minuti;
  - con `caddy`, il codice di `https://app.neokeeper.dev/updates/stable/latest.json`.

## Passi

- [ ] Test, prima del codice. Usa il `gh` finto di `bk-core`, un repository git temporaneo con un remote locale e i file di versione copiati dal repository, e server HTTP locali con `BK_UPDATES_BASE`, `BK_VPS_BASE` e `BK_SERVER_URL`. Il `ready` va provato contro quei server. Da provare:
  - gli argomenti esatti di ogni `gh workflow run`;
  - `release` e `deploy` fuori da `main` si fermano;
  - `release` si ferma se `gh release view` riesce;
  - `release` aggiunge la sezione del CHANGELOG e si ferma senza commit;
  - una sezione vuota dà un errore;
  - un `release` completo fa il commit `Release <v>` con i file giusti e il push;
  - `withdraw` senza la parola `ritira` non avvia nulla;
  - `switch` con R2 senza il canale beta non tocca né la variabile né la VPS;
  - `switch` riuscito controlla il 302;
  - `deploy` senza la parola `deploy` non avvia nulla.
- [ ] Verifica che falliscano, scrivi il codice e verifica che passino.
- [ ] Aggiorna `docs/bk.md`: ogni comando con un esempio; l'ordine per accendere R2 (`updates seed`, `updates`, `updates switch`); come tornare indietro.

## Acceptance criteria

- `npm run test:scripts` passa.
- `node scripts/bk.mjs help` elenca anche questi comandi.
- Cambiano solo i file dichiarati.
