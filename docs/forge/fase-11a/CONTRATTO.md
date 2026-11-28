# Contratto della fase 11A (versione 2.3.1)

## Fonti della ricerca ISBN
Ordine di unione dei campi (vince il primo che ha il campo): Google Books, SBN, Open Library, Library of Congress, Anna's Archive.

- **SBN (catalogo nazionale)**: `https://opac.sbn.it/opacmobilegw/search.json?isbn={isbn13}`. Dal primo record con lo stesso ISBN:
  - `titolo` «Il ciclo della cultura : prima trilogia / Iain M. Banks ; a cura di Franco Forte» → titolo «Il ciclo della cultura», sottotitolo «prima trilogia»; quello che segue « / » non si usa;
  - `autorePrincipale` «Banks, Iain M.» → «Iain M. Banks»;
  - `pubblicazione` «Milano : Mondadori, 2021» → editore «Mondadori», anno 2021.
  Nessuna copertina: l'indirizzo `copertina` usa una chiave di LibraryThing che è di SBN.
- **Library of Congress**: `https://lx2.loc.gov/sru/lcdb?version=1.1&operation=searchRetrieve&query=bath.isbn%3D{isbn}&maximumRecords=1&recordSchema=mods`, prima con l'ISBN-13 e, se non trova, con l'ISBN-10. Dal MODS: titolo e sottotitolo, autori («Austen, Jane, 1775-1817.» → «Jane Austen»), editore, anno, pagine, lingua (ISO 639-2 → 639-1, per esempio «eng» → «en»).
- **Google Books**: la chiave viene da `BOOKEEPER_GOOGLE_BOOKS_KEY` e va come `&key=`. Senza chiave Google non si chiama.
- **Anna's Archive**: solo `https://annas-archive.gl`. Non compare nell'elenco delle fonti.
- **Open Library**: come oggi.

## Stato delle fonti
- Nuovo endpoint `GET /api/v1/lookup/isbn/{isbn}/report` (con `?fresh=true` come l'altro) → 200 `{ "metadata": Metadata | null, "providers": [{ "id", "status" }] }`.
  - `id` è uno di `sbn`, `google-books`, `open-library`, `loc`, sempre in quest'ordine. Anna's non c'è.
  - `status` è uno di `found`, `empty`, `error`, `timeout`, `rate_limited`, `not_configured`.
- L'endpoint di oggi non cambia, così le app 2.3.0 continuano a funzionare.
- La memoria tiene anche gli stati. Un «non trovato» si ricorda solo se ogni fonte ha risposto (`found`, `empty` o `not_configured`); se una è in `error`, `timeout` o `rate_limited`, la volta dopo si riprova.

## Il riquadro «Fonti» (Impeccable, modalità Operate, mondo di `DESIGN.md`)
- Sta nel passo ISBN del computer (`IsbnStep`, `LookupNotice`) e nel foglio del risultato del telefono (`ResultSheet`): sotto l'anteprima quando il libro è trovato, sotto il messaggio quando non lo è.
- Superficie `--bk-inset`, raggio `--bk-radius`, 12 px sopra e sotto, 14 px ai lati.
- **Titolo:** «Fonti», Inter 12/600 in `--bk-text-muted`, maiuscolo spaziato come le altre etichette di sezione dell'app. A destra «Riprova» (kit `Button`, variante ghost, `sm`), solo se almeno una fonte è in `error`, `timeout` o `rate_limited`. Chiede di nuovo con `fresh=true`.
- **Una riga per fonte**, alta 28 px, nell'ordine dell'endpoint:
  - a sinistra un pallino di 8 px e il nome (Inter 13/500, `--bk-text`);
  - a destra lo stato a parole (Inter 13, `--bk-text-muted`).
- **Pallini:**
  - `found` pieno `--bk-ok`;
  - `error`, `timeout` e `rate_limited` pieni `--bk-warn`;
  - `empty` e `not_configured` vuoti, con bordo di 1,5 px `--bk-border-strong`.
- **Parole, italiano / inglese:**
  - Trovato / Found;
  - Nessun dato / No record;
  - Non risponde / Not responding (per `error` e `timeout`);
  - Limite raggiunto / Limit reached;
  - Chiave da configurare / Key not set.
- **Nomi:** «SBN (catalogo nazionale)» / «SBN (Italian national catalogue)», «Google Books», «Open Library», «Library of Congress».
- **Accessibilità:** il colore non è mai l'unico segno. Il riquadro è una lista (`ul`), con un nome accessibile per riga («Google Books: limite raggiunto»); il pallino è `aria-hidden`; «Riprova» ha nome «Riprova le fonti».
- **Movimento:** nessuno oltre a quello del kit; con `prefers-reduced-motion` niente.

## Lettore e app (hotfix)
- La percentuale non arriva a 100% prima dell'ultima pagina: 99% o 99,x%.
- In Scuro e Nero le immagini del libro hanno `filter: brightness(0.85)`.
- Il carattere scelto passa anche sopra le regole `!important` del libro: le sue regole stanno in `@layer reader-font`.
- «Editore»: se nessuna delle famiglie con un nome che il libro dà a un elemento di testo è disponibile (`document.fonts.check`) e il libro non porta un `@font-face` per loro, quell'elemento riceve Lora.
- Animazioni solo su `transform` e `opacity`, tutte dentro `@media (prefers-reduced-motion: no-preference)`. Nessun token CSS non definito in `packages/ui/src/tokens.css`.
