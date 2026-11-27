# Homepage di www.neokeeper.dev

Pagina statica che presenta Bookeeper, in italiano (`/`) e in inglese (`/en/`). Non ha dipendenze npm e non fa parte dei workspace della radice.

## Comandi

```bash
node apps/site/build.mjs          # scrive apps/site/dist
node apps/site/serve.mjs 4321     # la serve in locale
node --test apps/site/test/       # test dei download
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

La pagina non contiene versioni scritte a mano. Nel browser legge l'ultima release:

- **oggi:** `https://api.github.com/repos/Bardugo624/Bookeeper-Neo/releases/latest`;
- **domani:** l'indice `https://updates.neokeeper.dev/v2/downloads/stable.json`.

L'ordine delle fonti si sceglie alla build:

```bash
SITE_DOWNLOADS=index,github node apps/site/build.mjs
```

Con `index,github` la pagina prova prima l'indice e ripiega su GitHub. `fromIndex` accetta due forme:
- `{ version, date, notes?, files: [{ name, url, size? }] }`;
- `{ version, date, platforms: { <chiave>: { name?, url, size? } } }`.

Il tipo di file si riconosce dal nome, come per GitHub. Quando il formato reale sarà deciso, va aggiornato `fromIndex` con il suo test.

Due condizioni per l'indice su R2:
- DEVE rispondere con l'intestazione `Access-Control-Allow-Origin` per `https://www.neokeeper.dev`;
- senza quell'intestazione, il browser lo rifiuta e la pagina usa GitHub.

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
}
```

3. Validare e ricaricare Caddy, con il ripristino se la validazione fallisce, come fa già `deploy.sh`.

Da decidere con il proprietario prima di pubblicare:

- se `neokeeper.dev` senza `www` deve rimandare qui;
- se la pubblicazione va in un workflow manuale a parte, senza toccare i `vps-*.yml` esistenti;
- il record DNS di `www`.
