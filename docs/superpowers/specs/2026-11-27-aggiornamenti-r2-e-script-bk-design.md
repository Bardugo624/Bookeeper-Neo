# Aggiornamenti su R2 e script `bk` — design

Data: 2026-11-27. Stato: da approvare.

## Perché

- Il proprietario vuole distribuire gli aggiornamenti dell'app desktop dal bucket Cloudflare R2 `bookeeper-update`, come faceva la 0.1, invece che dalla VPS.
- Vuole uno script sul suo PC, nella copia del repository, per comandare la CI quando fa modifiche rapide senza PR: build, aggiornamenti, CI e distribuzione degli installer.

## Decisioni del proprietario

- **Indirizzo pubblico:** `updates.neokeeper.dev`, collegato al bucket come dominio personalizzato. Lo collega il proprietario dal pannello di Cloudflare.
- **Installazioni 2.0.x e 2.1.x**, che hanno scritto dentro `https://app.neokeeper.dev/updates`: Caddy sulla VPS rimanda `/updates/*` a R2.
- **Lo script comanda la CI**: non pubblica nulla dal PC. Le chiavi R2 stanno solo nei secret di GitHub, e le crea il proprietario. Lo script serve per le modifiche rapide senza PR.
- **Lo script è in Node**, nel repository.

## Obiettivi

1. La CI pubblica su R2 gli aggiornamenti (manifest e file firmati) e gli installer di ogni release.
2. Le app costruite da qui in avanti leggono gli aggiornamenti da `https://updates.neokeeper.dev/v2`.
3. Le app 2.0.x e 2.1.x arrivano a R2 attraverso il rimando della VPS, senza reinstallare nulla.
4. Sul PC, `npm run bk` apre un menu; `npm run bk -- <comando>` esegue un comando.

## Non obiettivi

- Pubblicare dal PC: sul PC non ci sono né le chiavi R2 né la chiave di firma degli aggiornamenti.
- Firmare il codice per Windows e macOS: servono certificati, ed è un lavoro a parte.
- Le app 0.x: i loro file nel bucket (`desktop/…`, manifest della 0.2.1) restano come sono. Nessun ponte dalla 0.x alla 2.x, per ora.
- Una pagina web di download.

## Cosa sarebbe un fallimento anche se funziona

- Un'app installata che non trova aggiornamenti, anche solo per qualche minuto: per esempio un rimando attivo verso un R2 ancora vuoto.
- Un manifest che torna indietro di versione, o che punta a file non ancora caricati.
- Un deploy della VPS partito per sbaglio, per esempio modificando un workflow.
- Un segreto stampato nei log: il repository è pubblico.

## Approcci considerati

**Indirizzo degli aggiornamenti**
- *Scelto:* dominio personalizzato `updates.neokeeper.dev`. Cloudflare lo serve dalla cache, senza i limiti di traffico dell'indirizzo `r2.dev`; se un giorno si lascia R2, l'indirizzo resta.
- *Scartato:* l'indirizzo `pub-….r2.dev` della 0.1. Cloudflare lo limita e lo sconsiglia per l'uso reale, e resterebbe scritto per sempre nelle app.

**Installazioni già in giro**
- *Scelto:* rimando di Caddy da `/updates/*` a R2. Una regola sola, e la VPS non tiene più file.
- *Scartato:* la CI pubblica sia sulla VPS sia su R2. Sono due copie da tenere allineate e più punti di rottura.

**Script**
- *Scelto:* Node nel repository, senza dipendenze nuove: gira su Windows, macOS e Linux, e usa `gh` per parlare con GitHub.
- *Scartato:* PowerShell, come nella 0.1. È familiare al proprietario, ma gira solo su Windows e duplica la logica.

## Com'è oggi

- `apps/desktop/src-tauri/src/updates.rs`: `DEFAULT_BASE = https://app.neokeeper.dev/updates`. Il manifest sta in `<base>/<canale>/latest.json`. `BOOKEEPER_UPDATE_BASE`, al momento della build, sostituisce la base.
- `scripts/update-manifest.mjs` scrive `latest.json` con gli URL `<base>/files/<versione>/<file>`. Il canale si ricava dalla versione: con un suffisso (`2.1.0-beta.1`) è `beta`, altrimenti `stable`.
- `.github/workflows/release.yml`, job `publish-updates`, copia i file sulla VPS con `scp` e poi scrive il manifest in modo atomico. Regole:
  - un manifest non viene mai sostituito da una versione più vecchia;
  - una release stabile aggiorna anche `beta`;
  - restano le 3 versioni più recenti più quelle a cui puntano i manifest.
- `.github/workflows/vps-deploy.yml` parte a ogni push sotto `ops/vps/deploy/**`, e a ogni modifica del workflow stesso, sul ramo `claude/funny-bell-g5wrux`. Costruisce l'immagine dal commit e installa container e Caddy. Per questo oggi qualsiasi modifica a quei file è un deploy di produzione.
- Il bucket `bookeeper-update` (regione EEUR) ha l'accesso pubblico `r2.dev` attivo. Contiene i file della 0.x sotto `desktop/`.
- L'aggiornatore di Tauri (`tauri-plugin-updater` 2.14.1) usa `reqwest` con la regola predefinita sui rimandi: li segue, fino a 10. Il rimando della VPS quindi funziona con le app già installate.
- Il numero di versione sta in 12 posti: `Cargo.toml` (`[workspace.package]`), `Cargo.lock` (le crate del workspace), `apps/desktop/src-tauri/tauri.conf.json`, i 5 `package.json` (`packages/ui`, `packages/api`, `packages/i18n`, `apps/desktop`, `apps/mobile`), `package-lock.json` (le stesse 5 voci), `packages/api/openapi.json` (`info.version`), più un test, `apps/desktop/src/modules/settings/settings.test.tsx`, che la scrive a mano. Il job `check` di `release.yml` confronta `Cargo.toml` con `tauri.conf.json` e, quando si pubblica, richiede la sezione della versione nel `CHANGELOG.md`. Le build usano `--locked`.

## Design

### Il bucket

```
v2/stable/latest.json            manifest del canale stabile
v2/beta/latest.json              manifest del canale beta
v2/files/<versione>/<file>       file di aggiornamento e le loro .sig
v2/downloads/<versione>/<file>   installer da scaricare (exe, dmg, AppImage, deb)
v2/downloads/stable.json         indice: versione, data, link per piattaforma
v2/downloads/beta.json
desktop/…                        app 0.x: non si tocca
```

- Indirizzo pubblico: `https://updates.neokeeper.dev/v2/…`.
- Cache:
  - i manifest e gli indici dei download hanno `Cache-Control: no-cache`;
  - i file sotto `files/` e `downloads/<versione>/` hanno `public, max-age=31536000, immutable`, perché non cambiano mai.

### Pubblicazione dalla CI

- Il job `publish-updates` di `release.yml` pubblica su R2 invece che sulla VPS, con le stesse regole di oggi:
  - i file vanno su prima del manifest;
  - il manifest non torna mai indietro di versione;
  - una release stabile aggiorna anche `beta`;
  - restano le 3 versioni più recenti più quelle a cui puntano i manifest.
- Lo stesso job carica gli installer in `downloads/<versione>/` e scrive l'indice del canale, sempre per ultimo.
- **Credenziali:**
  - secret `R2_ACCESS_KEY_ID` e `R2_SECRET_ACCESS_KEY`;
  - variabili del repository `R2_ACCOUNT_ID`, `R2_BUCKET` (`bookeeper-update`) e `UPDATES_BASE` (`https://updates.neokeeper.dev/v2`).
- Senza i secret il job avvisa e salta, come fa oggi senza la chiave della VPS.
- **Script e test:** la logica delle decisioni sta in uno script Node di `scripts/`, provato con `node --test` come gli script che ci sono già. Le decisioni sono: cosa caricare, se il manifest si può sostituire, cosa tenere e cosa cancellare. Lo script ha una modalità `--dry-run` che stampa il piano senza toccare il bucket.
- **Nessun segreto nei log:** nessun comando stampa chiavi, intestazioni o URL firmati.
- **Il workflow `updates.yml`** (solo `workflow_dispatch`) serve a ritirare un aggiornamento difettoso: riporta il manifest di un canale a una versione ancora presente in `v2/files/`. È l'unica eccezione alla regola «mai indietro», e la chiede il proprietario dallo script. Le app che hanno già installato la versione ritirata non tornano indietro: il ritiro ferma solo chi non l'ha ancora presa.

### L'app

- `DEFAULT_BASE` diventa `https://updates.neokeeper.dev/v2`. `BOOKEEPER_UPDATE_BASE` continua a sostituirla, e i test di `updates.rs` seguono.
- Il test che scrive la versione a mano la legge invece da `package.json`, così cambiare versione non tocca i test.

### La VPS

- In `ops/vps/deploy/bookeeper.caddy` il blocco `/updates/*` diventa un rimando temporaneo (302) a `https://updates.neokeeper.dev/v2{resto del percorso}`, con la query invariata.
- `vps-deploy.yml` parte solo a mano (`workflow_dispatch`) e prende un parametro `target`:
  - `server`: immagine e container, come oggi, compreso Caddy;
  - `caddy`: solo il file di Caddy, validato e ricaricato, con ripristino se la validazione fallisce, come fa `deploy.sh`.

  Il push che porta questa modifica non deve far partire un deploy. Per gli eventi di push GitHub legge il workflow dal commit spinto, quindi il nuovo file, senza `push`, non parte. Il costruttore lo verifica nella documentazione di GitHub prima di spingere. Se non è così, la modifica va spinta insieme alla release, quando il codice sul ramo è quello rilasciato.
- Il rimando si accende solo quando R2 contiene già una release, con `bk deploy caddy`. Il proprietario ha chiesto questo cambio sulla VPS.
- Cancellare `/opt/bookeeper/updates` sulla VPS e il codice di pubblicazione via `scp` è un passo successivo, da fare solo con il via del proprietario.

### Lo script `bk`

- **Posto e prerequisiti:**
  - file `scripts/bk.mjs`; comando `npm run bk`;
  - Node ≥ 20, nessuna dipendenza nuova;
  - Windows, macOS e Linux;
  - con GitHub parla solo attraverso `gh`, che deve essere installato e collegato (`gh auth login`);
  - lo stato pubblico lo legge dagli URL pubblici.
- **Lingua:** messaggi in italiano.
- **Uso:** senza argomenti apre un menu numerato, che chiede ciò che serve. Con un argomento esegue il comando direttamente, con le opzioni sulla riga.

| Comando | Cosa fa |
|---|---|
| `status` | Ramo, ultimo commit, se è già su GitHub, versione nel repository. Le ultime esecuzioni di CI, Release e VPS deploy. Le versioni sui canali stabile e beta (manifest pubblici). La versione del server (`https://app.neokeeper.dev/api/v1/server`). |
| `build` | Avvia `release.yml` senza pubblicare, sul ramo attuale, che deve essere già su GitHub. Segue l'esecuzione; alla fine propone di scaricare gli installer in `dist/<versione>/` (ignorata da git). |
| `release <patch\|minor\|major\|beta\|x.y.z>` | Calcola la nuova versione. `beta` aggiunge o incrementa `-beta.N`. Aggiorna la versione in tutti i posti elencati sopra, senza Rust né `npm install` sul PC. Controlla che `CHANGELOG.md` abbia la sezione della nuova versione; se manca, la crea vuota e si ferma per farla scrivere. Poi fa il commit «Release x.y.z» e il push, avvia `release.yml` con `publish`, segue l'esecuzione e alla fine controlla che il manifest del canale mostri la nuova versione. |
| `updates` | Mostra i due canali. `updates withdraw <canale> <versione>` avvia `updates.yml`, dopo una conferma. |
| `ci` | Elenca le esecuzioni. `ci watch [id]`, `ci logs [id]` (solo i passi falliti), `ci rerun [id]`. |
| `dist [versione]` | Stampa i link degli installer dall'indice del canale. Con `--download` li salva in `dist/<versione>/`. |
| `deploy <server\|caddy>` | Avvia `vps-deploy.yml` solo dopo che il proprietario ha scritto `deploy` per conferma. Segue l'esecuzione e alla fine controlla la versione del server, oppure il rimando. |
| `doctor` | Controlla Node, git, `gh` (installato, collegato, con accesso al repository), il remote, l'albero pulito e la presenza delle dipendenze npm. |

**Regole di sicurezza**
- Lo script non stampa segreti e non crea tag: il tag lo crea la release.
- `release` rifiuta un albero sporco o un ramo non allineato con GitHub.
- `deploy` e `updates withdraw` chiedono sempre conferma.

### Test

- **Script Node, con `node --test`:**
  - il calcolo della versione;
  - l'aggiornamento di tutti i posti della versione, su una copia di prova del repository;
  - il piano di pubblicazione su R2 (manifest più recente o assente, stabile che aggiorna beta, file da tenere);
  - la lettura dei comandi;
  - le chiamate a `gh`, verificate con un `gh` finto sul `PATH`.
- **App:** i test di `updates.rs` sulla nuova base.
- **Workflow:** la modalità `--dry-run` della pubblicazione, provata in CI senza secret.

### Ordine di messa in opera

1. **Implementazione** (run Forge):
   - pubblicazione su R2 dietro il controllo dei secret;
   - nuova base nell'app;
   - `vps-deploy.yml` solo manuale con `target`;
   - regola di Caddy pronta ma non installata;
   - `updates.yml`;
   - script `bk`.
2. **Il proprietario** collega `updates.neokeeper.dev` al bucket, poi crea i secret e le variabili.
3. **Prima release con R2:** pubblicazione, poi verifica di `https://updates.neokeeper.dev/v2/stable/latest.json` e dei file a cui punta.
4. **`bk deploy caddy`**, poi verifica che `https://app.neokeeper.dev/updates/stable/latest.json` risponda 302 verso R2 e che il manifest arrivi.
5. **Più avanti, con il via del proprietario:** pulizia della VPS e del codice `scp`.

## Lasciato al costruttore

- Come parlare con R2 dalla CI: `aws s3` del runner con `--endpoint-url`, con le variabili sui checksum che R2 richiede, oppure un piccolo client SigV4 in Node. In ogni caso nessuna dipendenza npm nuova.
- I dettagli del menu, i nomi dei file degli script e la struttura dei test.
