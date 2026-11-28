# Homepage di www.neokeeper.dev

Pagina statica che presenta Bookeeper, in italiano (`/`) e in inglese (`/en/`). Non ha dipendenze npm e non fa parte dei workspace della radice.

## Comandi

```bash
node apps/site/build.mjs          # scrive apps/site/dist
node apps/site/serve.mjs 4321     # la serve in locale
node --test apps/site/test/*.test.mjs   # test dei download
```

## Cache

Cloudflare, davanti al sito, impone 4 ore di cache del browser a CSS e JavaScript, qualunque cosa dica Caddy. Per questo la build mette nell'indirizzo di ogni stile, script e immagine un'impronta del suo contenuto (`?v=…`). Un file cambiato ha un indirizzo nuovo, quindi pagina nuova e stile vecchio non possono convivere. Le pagine HTML non vanno in cache (`no-cache`).

## Struttura

- `src/strings.mjs`: tutti i testi, IT e EN. Le citazioni sono copiate da `docs/citazioni/citazioni.json`, con la loro fonte.
- `src/page.mjs`: il modello HTML.
- `src/house.mjs` e `src/plan.mjs`: la casa d'esempio, la pianta e il prospetto del mobile. Lo stesso codice disegna la pagina statica e risponde ai clic nel browser.
- `src/downloads.mjs`: legge la release e sceglie l'installer del visitatore.
- `src/site.js`: tema, «Dov'è», download.
- `public/`: font (Lora e Inter, licenza OFL), icone dell'app, schermate.
- `scripts/shots/`: come rifare le schermate su una libreria d'esempio (vedi il suo README).

## Download e versioni

La pagina non contiene versioni scritte a mano. A ogni visita il browser legge l'ultima versione stabile e aggiorna da solo:
- il pulsante;
- il peso del file;
- la tabella dei file;
- la data;
- la sezione «Le novità della versione».

**Installer.** La pagina prova le fonti in ordine e usa la prima che risponde con file riconosciuti:

1. l'indice su R2, `https://updates.neokeeper.dev/v2/downloads/stable.json`;
2. l'ultima release su GitHub, `api.github.com/repos/Bardugo624/Bookeeper-Neo/releases/latest`;
3. il manifest dell'aggiornamento, prima su R2 e poi sulla VPS. Versione, data e novità vengono dal manifest. I link agli installer si costruiscono dallo schema fisso dei nomi della release (`releaseFileNames`), senza peso dei file.

La terza fonte esiste perché l'API di GitHub concede 60 richieste all'ora per indirizzo IP. Chi la supera, per esempio da una rete condivisa, vede lo stesso la versione giusta e i link giusti.

Se lo schema dei nomi degli installer cambia, `releaseFileNames` e il suo test DEVONO cambiare con lui.

La VPS non ospita installer: ha solo i file di aggiornamento dell'app.

**Novità.** Vengono dal manifest dell'aggiornamento, lo stesso che leggono le app. La pagina legge il primo che annuncia la stessa versione degli installer:

1. R2: `https://updates.neokeeper.dev/v2/stable/latest.json`;
2. VPS: `/updates/stable/latest.json`, servito dallo stesso dominio del sito (vedi il blocco di Caddy più sotto);
3. se nessun manifest corrisponde, il testo della release su GitHub, che contiene la stessa sezione del CHANGELOG.

Le note sono in markdown, con il sottoinsieme del CHANGELOG. `notesToHtml` le rende in modo sicuro: prima esegue l'escape del testo, e accetta solo link `https`.

Oggi R2 non risponde ancora. La pagina passa a GitHub per gli installer e alla VPS per le novità. Quando R2 sarà attivo, lo userà senza rifare la build.

L'ordine delle fonti degli installer si può cambiare alla build, per esempio solo GitHub:

```bash
SITE_DOWNLOADS=github,manifest node apps/site/build.mjs
```

`fromIndex` accetta due forme:
- `{ version, date, notes?, files: [{ name, url, size? }] }`;
- `{ version, date, platforms: { <chiave>: { name?, url, size? } } }`.

Il tipo di file si riconosce dal nome, come per GitHub. Quando il formato reale sarà deciso, va aggiornato `fromIndex` con il suo test.

Due condizioni per R2:
- l'indice e il manifest DEVONO rispondere con `Access-Control-Allow-Origin: https://www.neokeeper.dev`, cioè con una regola CORS sul bucket;
- senza quella regola, il browser li rifiuta e la pagina usa GitHub e la VPS.

Se nessuna fonte risponde, il pulsante porta alla pagina delle release.

## Pubblicazione

Il sito sta sulla VPS, servito da Caddy come `www.neokeeper.dev`. Il dominio senza `www` rimanda lì.

- **Workflow:** `.github/workflows/site-deploy.yml`. Parte da solo a ogni push su `claude/homepage-neokeeper` che tocca `apps/site/**`, oppure a mano (`workflow_dispatch`). È separato da `vps-deploy.yml`: non tocca il container del server né `bookeeper.caddy`. Usa la stessa coda (`vps-ops`), quindi due interventi sulla VPS non si sovrappongono.
- **Cosa fa sulla VPS** (`deploy/install.sh`):
  - mette i file in `/srv/neokeeper-site`; la versione precedente resta in `/srv/neokeeper-site.old`;
  - installa `deploy/neokeeper-site.caddy` come `/etc/caddy/neokeeper-site.caddy`;
  - aggiunge `import neokeeper-site.caddy` al Caddyfile;
  - valida la configurazione e ricarica Caddy. Se la validazione fallisce, ripristina Caddyfile, file del sito e cartella.
- **Il sito Caddy:**
  - serve la pagina;
  - serve in sola lettura `/updates/stable/latest.json`, preso da `/opt/bookeeper/updates`, per le novità;
  - rimanda `neokeeper.dev` a `www`.

### DNS (su Cloudflare, a cura del proprietario)

- `www` → record A `82.165.185.245`, solo DNS (nuvola grigia). Caddy ottiene il certificato da solo.
- `neokeeper.dev` → perché funzioni il rimando, anche il dominio senza `www` DEVE puntare a `82.165.185.245`. Con il proxy di Cloudflare attivo, la modalità SSL DEVE essere «Full».

Finché il DNS manca, Caddy riprova da solo a ottenere il certificato e gli altri siti non ne risentono.
