Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# Libri: griglia, ricerca, filtri, scheda in sola lettura

## Obiettivo

Il modulo `books` in sola lettura: le schermate "02 — Libri" e "04 — Scheda libro" del mockup. Creazione, modifica, eliminazione, prestito e stato di lettura arrivano nel run 2B: i loro bottoni NON esistono qui. Le task `app-foundation`, `ui-overlays` e `ui-book` sono già unite. Leggi `apps/desktop/src/app/`, `packages/api/src/resources/books.ts`, `covers.ts` e il modulo `books` della 0.3 per il comportamento.

## Cosa fare

1. **`routes.tsx`**: modulo `books` con `nav` (etichetta "Libri", icona `book`, gruppo `main`, ordine 10) e rotte `/books` e `/books/:id`.
2. **Dati** (hook con `@tanstack/react-query`): elenco con `q`, `on_loan`, `unshelved`, `sort`, `order`, a pagine di 60 con caricamento della pagina seguente quando la fine della griglia entra in vista (`IntersectionObserver`); dettaglio per id; copertina. Leggi in `covers.ts` come si ottiene l'immagine: passa dal trasporto (`requestRaw`) con `ETag`, e diventa un URL oggetto che si revoca allo smontaggio. Senza copertina salvata: segnaposto con `cover_color` se presente.
3. **Vista elenco**:
   - Intestazione con titolo e conteggio (`total` dell'API; "N in prestito" da una seconda richiesta con `on_loan=true&limit=1`), plurali da i18n.
   - Campo di ricerca con ritardo di 250 ms, tasto `Ctrl K` tramite `useSearchShortcut`, bottone per svuotare.
   - Filtri `PillTabs` variante `pill`: Tutti, In prestito, Non collocati. "Da leggere", "In lettura", "Letti" e "Filtri" NON compaiono: lo stato di lettura non esiste ancora nel core.
   - Selettore `PillTabs` variante `segmented` griglia/lista, scelta salvata in `localStorage` sotto l'id della connessione.
   - Griglia come nel mockup: `BookCover` con `lift`, titolo su una riga, autori uniti da virgola, etichetta "In prestito". Ogni card è un link alla scheda con nome accessibile "titolo, autore".
   - Lista: tabella con Titolo, Autore, Anno, Collocazione, stato di prestito; intestazioni ordinabili per le colonne che l'API sa ordinare (leggi i valori ammessi di `sort` nel core), con `aria-sort`.
   - Stati: scheletri al primo caricamento (dodici card); stato vuoto "Nessun libro" per libreria vuota; stato "Nessun risultato" con bottone che svuota ricerca e filtri; errore con "Riprova"; fila di scheletri durante il caricamento della pagina seguente.
   - Ricerca, filtro e vista stanno nei parametri dell'indirizzo: tornando dalla scheda si ritrova lo stesso elenco.
4. **Scheda libro** come nel mockup: `Book3D` (con `pages` da `page_count`), soprattitolo da genere e anno (solo le parti presenti), titolo, sottotitolo se c'è, autori, descrizione, metadati presenti (Editore, Pagine, Lingua, ISBN-13 o ISBN-10, Formato, Numero progressivo). Colonna destra: scheda "Dove si trova" (mobile e ripiano da `placement`, oppure "Non collocato") e scheda "Prestiti" (in prestito o no). Un campo assente non lascia etichette vuote. "‹ Libri" torna all'elenco conservandone i parametri. Libro inesistente (404): stato vuoto dedicato con link all'elenco.
5. Testi nello spazio dei nomi `books`, in italiano e in inglese.

## Test

Con il `Platform` finto e un client finto: nessuna rete.

- Scheletri, poi dodici card; conteggio e plurali ("1 libro", "248 libri").
- Ricerca: con timer finti una sola richiesta dopo 250 ms con `q`; svuota azzera `q`; `Ctrl K` porta il fuoco al campo.
- Filtri: "In prestito" manda `on_loan=true`; "Non collocati" manda `unshelved=true`; il filtro è nell'indirizzo.
- Pagina seguente: quando la sentinella entra in vista parte la richiesta con `offset=60`; alla fine dei risultati non parte altro.
- Griglia/lista: la scelta è salvata e riletta; in lista l'ordinamento cambia `sort`/`order` e `aria-sort`.
- Stati: libreria vuota; nessun risultato con azzeramento; errore con "Riprova" che rifà la richiesta.
- Card: nome accessibile; clic porta a `/books/<id>`; etichetta "In prestito" solo se `on_loan`.
- Copertina: con immagine l'URL oggetto è creato e revocato allo smontaggio; senza immagine segnaposto con `cover_color`.
- Scheda: tutti i campi presenti; campi assenti senza etichette vuote; non collocato; 404; "‹ Libri" conserva i parametri.
- Nessun bottone "Aggiungi", "Modifica", "Presta", "Segna come letto" nel DOM.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente: solo negli hook.
- Cambiano solo: file sotto `apps/desktop/src/modules/books/`, `packages/i18n/src/locales/it/books.json`, `packages/i18n/src/locales/en/books.json`.
