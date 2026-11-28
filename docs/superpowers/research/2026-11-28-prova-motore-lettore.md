# Prova del motore del lettore (fase 10B)

Data: 2026-11-28. Esito: **foliate-js confermato**.

## Cosa è stato provato

La prova chiesta dal design degli e-book (`docs/superpowers/specs/2026-11-27-ebook-design.md`, «Prima di cominciare»):
- **Motore:** foliate-js copiato senza modifiche dal repository ufficiale, al commit `78914ae` del 1° maggio 2026 (MIT).
- **Due libri generati** da `scripts/reader-trial/make-epubs.mjs`:
  - un EPUB grande, di 200 capitoli e circa 2,4 milioni di caratteri, con citazioni, note, tabelle e immagini;
  - un EPUB ostile, con script, gestori di eventi, immagini, un foglio di stile e un iframe presi da Internet.
- **La pagina di prova** (`apps/mobile/public/prova-lettore/`) usa la regola di sicurezza che il lettore vero dovrà avere: script solo della pagina, niente rete.
- **Il percorso:** la pagina apre il libro grande, gira 100 pagine e misura il tempo fino alla pagina nuova disegnata. Poi apre il libro ostile.
- **Le condizioni:** schermo di 390×844, come un telefono. Lo script `scripts/reader-trial/run.mjs` gira in ogni motore; il workflow `reader-trial.yml` lo fa girare in tutti e tre.

## Risultati (CI, run 46112640534)

| Motore | Apertura | Pagina: mediana / p95 / massimo | Sopra 100 ms | Codice del libro | Richieste uscite |
|---|---|---|---|---|---|
| Chromium 153 | 115 ms | 25 / 33 / 33 ms | 0 su 100 | no | 0 |
| WebKit 26.6 | 1072 ms | 25 / 32 / 35 ms | 0 su 100 | no | 0 |
| Firefox 155 | 260 ms | 26 / 32 / 33 ms | 0 su 100 | no | 0 |

- **Velocità:** girare pagina è lontano dalla soglia di ritardo percepibile, 100 ms. I tempi comprendono due fotogrammi di disegno, circa 17–33 ms.
- **Sicurezza:** la regola della pagina arriva nella cornice del libro anche in WebKit, dove l'iframe deve avere `allow-scripts` per il bug 218086. In tutti e tre i motori restano bloccati:
  - script inline e gestori di eventi;
  - il foglio di stile, le immagini e l'iframe esterni.
- **Apertura in WebKit:** 1 secondo, il tempo più lungo, per un libro di 2,5 MB. Il lettore deve mostrare che sta aprendo.

## Cosa resta per la 10B

- **Il blocco fra due pagine:** foliate-js tiene fermo il giro successivo per 100 ms, apposta. Chi legge non lo vede, ma i comandi rapidi (tasto tenuto premuto) ne risentono.
- **La chiusura:** chiudendo una vista, un `ResizeObserver` di foliate-js scatta dopo `destroy()` e lancia un errore innocuo, `Cannot destructure property 'style' of 'el'`. Il lettore deve chiudere in un ordine che lo eviti, o gestire l'errore.
- **Gli altri formati:** questa copia ha solo i moduli per EPUB. PDF (pdf.js), MOBI, FB2 e CBZ entrano con la 10B.

## La prova sull'iPhone

Non fatta: il proprietario ha scelto di farsi bastare la prova automatica nei tre motori («Salta l'iPhone»). La pagina di prova non è pubblicata sulla VPS.
