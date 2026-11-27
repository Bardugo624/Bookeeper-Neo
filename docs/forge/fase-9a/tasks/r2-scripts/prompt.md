Leggi prima `docs/forge/fase-9a/CONTRATTO.md`, `docs/forge/fase-9a/request.md` e il design che citano. La task `bk-version` è già unita: usa `compare` di `scripts/semver.mjs`.

# Pubblicare su R2: lo script `updates-r2.mjs`

## File

- Crea:
  - `scripts/updates-r2.mjs`: il comando;
  - `scripts/r2/plan.mjs`: le decisioni, funzioni pure;
  - `scripts/r2/bucket.mjs`: l'accesso al bucket attraverso il comando `aws`;
  - `scripts/r2/ready.mjs`: il controllo pubblico.
- Crea i test e gli aiuti:
  - `scripts/r2/plan.test.mjs`;
  - `scripts/r2/ready.test.mjs`;
  - `scripts/updates-r2.test.mjs`;
  - `scripts/r2/fake-aws.mjs`: un `aws` finto che i test mettono sul `PATH` e che tiene il bucket in una cartella temporanea.
- Non modificare `scripts/update-manifest.mjs`: usane `buildManifest`, `channelOf` e `platformOf`.

## Il comando

```
node scripts/updates-r2.mjs publish  --version <v> --updates <dir> --installers <dir> --notes-file <f> --base <url> [--dry-run]
node scripts/updates-r2.mjs seed     --from <dir> --from-base <url> --base <url> [--dry-run]
node scripts/updates-r2.mjs withdraw --channel <stable|beta> --version <v> --base <url> [--dry-run]
node scripts/updates-r2.mjs ready    --base <url> --vps <url>
```

**Variabili d'ambiente dei comandi sul bucket:** `R2_ACCOUNT_ID`, `R2_BUCKET`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.
- Se ne manca una: codice d'uscita 2 e un messaggio che nomina quelle che mancano, mai i valori.
- Con `--dry-run` e senza variabili, il piano si calcola su un bucket vuoto. Questo permette di provarlo in CI.
- `ready` non usa variabili: legge solo indirizzi pubblici.

**Il prefisso delle chiavi** si ricava dalla base: `keyPrefix('https://updates.neokeeper.dev/v2') === 'v2/'`.

**`aws`:**
- sempre con `--endpoint-url https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`;
- nell'ambiente: `AWS_DEFAULT_REGION=auto`, `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` e `AWS_RESPONSE_CHECKSUM_VALIDATION=when_required`;
- operazioni: `s3 cp <file> s3://<bucket>/<chiave>` con `--cache-control` e `--content-type`; `s3 cp s3://<bucket>/<chiave> -` per leggere; `s3 ls s3://<bucket>/<prefisso> --recursive`; `s3 rm`;
- il comando completo non si stampa mai: niente variabili d'ambiente nei log.

**Tipi di contenuto:**

| File | Tipo |
|---|---|
| `.json` | `application/json` |
| `.sig` | `text/plain` |
| `.exe` | `application/vnd.microsoft.portable-executable` |
| `.dmg` | `application/x-apple-diskimage` |
| `.deb` | `application/vnd.debian.binary-package` |
| `.tar.gz` | `application/gzip` |
| tutto il resto | `application/octet-stream` |

**Cache:** come nel contratto.

### `publish`

Ordine dei passi:
1. Ogni file di `--updates` (file e `.sig`) va in `<p>files/<v>/`.
2. Il manifest della versione, costruito con `buildManifest({ dir, version, notes, baseUrl: base })`, va in `<p>files/<v>/manifest.json`.
3. Ogni installer di `--installers` va in `<p>downloads/<v>/`.
4. Il manifest del canale (`channelOf(v)`) va in `<p><canale>/latest.json`, solo se l'attuale è assente, uguale o più vecchio. Altrimenti si stampa «keeping the newer manifest». Una release stabile scrive anche `<p>beta/latest.json`, con la stessa regola.
5. L'indice `<p>downloads/<canale>.json`, con la stessa regola. Contiene `{ version, pub_date, files: { <piattaforma>: <url> } }`, con le piattaforme `windows-x86_64`, `darwin-aarch64`, `darwin-x86_64`, `linux-x86_64-appimage` e `linux-x86_64-deb`, riconosciute dai nomi degli installer.
6. Pulizia: sotto `files/` e sotto `downloads/` restano:
   - le 3 versioni più recenti, ordinate con `compare` e non per data;
   - le versioni a cui puntano i manifest dei canali e gli indici;
   - la versione appena pubblicata.

   Il resto si cancella.

Rilanciare `publish` con gli stessi file lascia il bucket com'era.

### `seed`

- `--from` contiene `stable/latest.json`, `beta/latest.json` e `files/<v>/…`, cioè la copia della VPS.
- In ogni manifest, gli URL che iniziano con `--from-base` diventano URL che iniziano con `--base`. Un URL che non inizia con `--from-base` è un errore.
- Si caricano:
  1. i file a cui puntano i manifest;
  2. il manifest riscritto, in `files/<v>/manifest.json`;
  3. i manifest dei canali, con la regola di `publish`.

### `withdraw`

- Copia `<p>files/<v>/manifest.json` in `<p><canale>/latest.json`. È l'unico caso in cui si torna indietro.
- Se la versione non ha `manifest.json`, esce con un errore.
- Stampa la versione vecchia e quella nuova.

### `ready`

Riesce (codice 0) solo se:
- `<base>/stable/latest.json` e `<base>/beta/latest.json` rispondono 200 con JSON valido;
- ciascuna versione è maggiore o uguale a quella di `<vps>/<canale>/latest.json`, quando la VPS ne ha una;
- ogni URL delle piattaforme dei due manifest di R2 risponde 200 a una richiesta `HEAD`.

Altrimenti codice 1, con l'elenco dei motivi.

## Passi

- [ ] Test in `plan.test.mjs`, prima del codice:
  - `keyPrefix`;
  - la regola «assente, uguale o più vecchio» (`2.2.0-beta.1` non sostituisce `2.2.0`);
  - una stabile scrive anche beta, ma non sopra una beta più nuova;
  - l'insieme da tenere, con versioni come `2.10.0` e `2.9.0`;
  - il riconoscimento delle piattaforme degli installer;
  - la riscrittura degli URL di `seed`, compreso l'errore.
- [ ] Test in `updates-r2.test.mjs`, con `fake-aws` sul `PATH`:
  - `publish` su un bucket vuoto mette le chiavi giuste, con cache e tipi giusti, nell'ordine «file prima dei manifest»;
  - un secondo `publish` identico non cambia nulla;
  - una versione più vecchia non sostituisce il manifest;
  - la pulizia;
  - senza variabili: codice 2 e nomi delle variabili, nessun valore stampato; `--dry-run` senza variabili riesce;
  - `withdraw`;
  - `seed`.
- [ ] Test in `ready.test.mjs`, con un server HTTP locale per R2 e uno per la VPS:
  - pronto;
  - manca il canale beta;
  - stabile più vecchia della VPS;
  - un file che risponde 404.
- [ ] Verifica che i test falliscano, scrivi il codice e verifica che passino.

## Acceptance criteria

- `npm run test:scripts` passa.
- Cambiano solo i file dichiarati.
