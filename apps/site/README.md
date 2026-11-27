# Homepage di www.neokeeper.dev

Pagina statica che presenta Bookeeper, in italiano (`/`) e in inglese (`/en/`). Non ha dipendenze npm e non fa parte dei workspace della radice.

## Comandi

```bash
node apps/site/build.mjs          # scrive apps/site/dist
node apps/site/serve.mjs 4321     # la serve in locale
node --test apps/site/test/*.test.mjs   # test dei download
```

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
2. l'ultima release su GitHub, `api.github.com/repos/Bardugo624/Bookeeper-Neo/releases/latest`.

La VPS non ospita installer: ha solo i file di aggiornamento dell'app.

**Novità.** Vengono dal manifest dell'aggiornamento, lo stesso che leggono le app. La pagina legge il primo che annuncia la stessa versione degli installer:

1. R2: `https://updates.neokeeper.dev/v2/stable/latest.json`;
2. VPS: `/updates/stable/latest.json`, servito dallo stesso dominio del sito (vedi il blocco di Caddy più sotto);
3. se nessun manifest corrisponde, il testo della release su GitHub, che contiene la stessa sezione del CHANGELOG.

Le note sono in markdown, con il sottoinsieme del CHANGELOG. `notesToHtml` le rende in modo sicuro: prima esegue l'escape del testo, e accetta solo link `https`.

Oggi R2 non risponde ancora. La pagina passa a GitHub per gli installer e alla VPS per le novità. Quando R2 sarà attivo, lo userà senza rifare la build.

L'ordine delle fonti degli installer si può cambiare alla build, per esempio solo GitHub:

```bash
SITE_DOWNLOADS=github node apps/site/build.mjs
```

`fromIndex` accetta due forme:
- `{ version, date, notes?, files: [{ name, url, size? }] }`;
- `{ version, date, platforms: { <chiave>: { name?, url, size? } } }`.

Il tipo di file si riconosce dal nome, come per GitHub. Quando il formato reale sarà deciso, va aggiornato `fromIndex` con il suo test.

Due condizioni per R2:
- l'indice e il manifest DEVONO rispondere con `Access-Control-Allow-Origin: https://www.neokeeper.dev`, cioè con una regola CORS sul bucket;
- senza quella regola, il browser li rifiuta e la pagina usa GitHub e la VPS.

Se nessuna fonte risponde, il pulsante porta alla pagina delle release.

## Pubblicazione (proposta, non applicata)

Il proprietario ha scelto la VPS con Caddy. Niente di quanto segue è stato fatto: serve il suo via esplicito. I file in `ops/vps/` non sono stati toccati.

1. Copiare `apps/site/dist/` sulla VPS, per esempio in `/srv/neokeeper-site/`.
2. Aggiungere a Caddy un sito come questo:

```caddyfile
www.neokeeper.dev {
	root * /srv/neokeeper-site
	encode zstd gzip
	file_server
	header /fonts/* Cache-Control "public, max-age=31536000, immutable"
	header /shots/* Cache-Control "public, max-age=86400"
	header /*.html Cache-Control "no-cache"

	# Only the stable updater manifest, read-only, on the site's own origin: the page reads the notes from it.
	handle /updates/stable/latest.json {
		root * /opt/bookeeper
		header Cache-Control "no-cache"
		file_server
	}
}
```

3. Validare e ricaricare Caddy, con il ripristino se la validazione fallisce, come fa già `deploy.sh`.

Da decidere con il proprietario prima di pubblicare:

- se `neokeeper.dev` senza `www` deve rimandare qui;
- se la pubblicazione va in un workflow manuale a parte, senza toccare i `vps-*.yml` esistenti;
- il record DNS di `www`.
