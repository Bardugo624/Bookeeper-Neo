# Contratto del run 9A: aggiornamenti su R2 e script `bk`

Il design approvato è `docs/superpowers/specs/2026-11-27-aggiornamenti-r2-e-script-bk-design.md`: leggilo prima di ogni task, insieme a `docs/forge/fase-9a/request.md`. Qui ci sono le regole comuni e le interfacce che le task si scambiano.

## Valori fissati

- Base pubblica degli aggiornamenti su R2: `https://updates.neokeeper.dev/v2`. Prefisso delle chiavi nel bucket: `v2/`, cioè il percorso della base senza la barra iniziale.
- Base della VPS, che le app 2.0.x e 2.1.x hanno scritto dentro: `https://app.neokeeper.dev/updates`.
- Bucket: `bookeeper-update`.
- Chiavi:
  - `v2/stable/latest.json` e `v2/beta/latest.json`: manifest dei canali;
  - `v2/files/<versione>/<file>`: file di aggiornamento e le loro `.sig`;
  - `v2/files/<versione>/manifest.json`: il manifest di quella versione, che serve per ritirare un aggiornamento;
  - `v2/downloads/<versione>/<file>`: installer;
  - `v2/downloads/stable.json` e `v2/downloads/beta.json`: indici dei download.
- Cache:
  - manifest e indici: `Cache-Control: no-cache`;
  - tutto il resto sotto `files/` e `downloads/<versione>/`: `public, max-age=31536000, immutable`.
- Secret di GitHub: `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`.
- Variabili di GitHub:
  - `R2_ACCOUNT_ID`, `R2_BUCKET`;
  - `UPDATES_BASE` (se manca: `https://updates.neokeeper.dev/v2`);
  - `UPDATES_REDIRECT` (`on` quando il rimando della VPS è acceso; altrimenti spento).
- Endpoint S3 di R2: `https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, regione `auto`.
- Il canale si ricava dalla versione con `channelOf` di `scripts/update-manifest.mjs`: con un suffisso è `beta`, altrimenti `stable`.
- Ramo: `release` e `deploy` solo da `main`.

## Regole

- **Dipendenze e formato:**
  - nessuna dipendenza npm nuova;
  - Node ≥ 20, script ESM `.mjs` come quelli di `scripts/`;
  - test con `node --test`, che `npm run test:scripts` (`node --test "scripts/**/*.test.mjs"`) raccoglie da sé, e la CI lo esegue già.
- **Nessuna chiamata esterna dalle task:** niente push, niente tag, niente richieste a GitHub, a R2 o alla VPS. I test usano un `gh` e un `aws` finti sul `PATH` e server HTTP locali.
- **Nessun segreto in chiaro:**
  - nessun comando, log o messaggio di errore stampa chiavi, intestazioni di autenticazione o URL firmati;
  - un errore su una variabile d'ambiente ne nomina il nome, mai il valore.
- **VPS:**
  - solo la task `r2-workflows` tocca `.github/workflows/vps-*.yml`, `ops/vps/run.sh` e `ops/vps/deploy/**`;
  - dopo quella task nessun workflow `vps-*.yml` ha un trigger `push`, e un test lo verifica;
  - questo conta perché un push di quei file sul ramo di lavoro oggi fa partire un deploy di produzione.
- **Lingua:**
  - messaggi dello script `bk` in italiano: frasi brevi, seconda persona, niente gergo;
  - commenti nel codice in inglese, solo dove servono.
- **File e ambito:**
  - file brevi e con un solo compito; nessuno oltre circa 250 righe;
  - ogni task tocca solo i file che dichiara.
- **Sistemi operativi:**
  - lo script `bk` gira anche su Windows: `spawn` di `gh` e `git` con `shell: false`, mai `npm` (su Windows è un `.cmd`);
  - percorsi con `node:path`;
  - i file letti e riscritti conservano i loro a capo (`\r\n` o `\n`).

## Interfacce fra le task

- `scripts/semver.mjs` (task `bk-version`):
  - `parse(v)`;
  - `compare(a, b) → -1 | 0 | 1`, con le regole di precedenza di SemVer 2.0.0;
  - `inc(v, kind)` con `kind` in `patch | minor | major | beta`;
  - `isPrerelease(v)`.
- `scripts/bk/version.mjs` (task `bk-version`):
  - `readVersion(root)`;
  - `bumpVersion(root, to) → string[]`;
  - `ensureChangelog(root, version, date) → { existed }`.
- `scripts/updates-r2.mjs` (task `r2-scripts`): comandi `publish`, `seed`, `withdraw`, `ready`, con le opzioni scritte nella task.
- `scripts/bk/{errors,gh,git,public,menu}.mjs` e il registro dei comandi in `scripts/bk.mjs` (task `bk-core`).
- Workflow (task `r2-workflows`):
  - `release.yml` con l'input `publish` (booleano);
  - `updates.yml` con gli input `action` (`seed`, `withdraw`), `channel` (`stable`, `beta`), `version` e `dry_run` (booleano);
  - `vps-deploy.yml` con l'input `target` (`server`, `caddy`);
  - la variabile `UPDATES_REDIRECT`.

## Cose che più facilmente farebbero male, e dove sono provate

1. **R2 non ancora configurato** (oggi è così). La release deve pubblicare sulla VPS come prima e saltare R2 con un avviso chiaro. Lo provano `r2-workflows` (il controllo nel workflow) e `r2-scripts` (senza variabili d'ambiente `publish` esce con codice 2 e nomina le variabili che mancano).
2. **Copia di lavoro Windows con a capo `\r\n`.** Il cambio di versione e il CHANGELOG li conservano, e i JSON non vengono riformattati. Lo prova `bk-version`.
3. **Release interrotta a metà.** Se il tag o la release su GitHub esistono già, rilanciare `bk release` sulla stessa versione si ferma con un messaggio chiaro. Una nuova `publish` con gli stessi file lascia il bucket com'era. Lo provano `bk-publish` e `r2-scripts`.
4. **`gh` assente o non collegato sul PC.** Messaggio in italiano con la soluzione, codice d'uscita 1, nessuna traccia dello stack. Lo prova `bk-core`.
5. **Rimando acceso con R2 incompleto.** Se R2 non ha un canale, o ha una versione più vecchia della VPS, `ready` fallisce e né `bk updates switch` né `vps-deploy.yml` toccano la VPS. Lo provano `r2-scripts`, `r2-workflows` e `bk-publish`.
