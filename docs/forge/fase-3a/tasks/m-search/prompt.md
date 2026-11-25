Leggi prima `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. La task `m-foundation` è già unita. Leggi `apps/mobile/src/{app,session,kit}`, `packages/api/src/resources/{books,covers}.ts`, il modulo `books` di `apps/desktop` (per come usa elenco e copertine: non importarlo) e `clients/mobile-web/src/views/{SearchView,BookDetailView}.vue`.

# Mobile: cerca e scheda libro

## Cosa fare

Modulo `search` con scheda "Cerca" (ordine 10).

1. **`/search`**: campo di ricerca in alto, fisso (testo 16px, bottone per svuotare, invio che chiude la tastiera); ritardo 250 ms. Senza testo: gli ultimi libri aggiunti. Risultati in elenco a una colonna: `BookCover` piccolo (56px), titolo su due righe al più, autori, e a destra un'etichetta se in prestito. Pagine da 40 con caricamento della successiva a fine elenco. Conteggio dei risultati annunciato in una regione `aria-live`. Stati: scheletri, libreria vuota, nessun risultato, errore con "Riprova", offline con l'ultimo risultato.
   Filtro rapido sotto il campo con `PillTabs`: Tutti, In prestito, Non collocati. Ricerca e filtro nell'indirizzo.
2. **`/books/:id`**: copertina grande al centro (`BookCover`, non `Book3D`), titolo in Lora, autori, poi blocchi: "Dove si trova" (mobile e ripiano, oppure "Non collocato") in evidenza, perché sul telefono la domanda è "dov'è?"; "Prestito" (in prestito o no); descrizione richiudibile oltre sei righe; metadati presenti. Ritorno all'elenco con la ricerca conservata. 404 → stato dedicato.
3. Copertine come nel desktop: tramite il trasporto, con URL oggetto revocato; non si chiede l'immagine se l'elenco dice che manca (leggi come lo sa il modulo desktop).
4. Sola lettura in questo run: nessun bottone di modifica.

Testi nello spazio dei nomi `msearch`.

## Test

- Ritardo di ricerca con timer finti; svuota; filtro e ricerca nell'indirizzo; pagina successiva.
- Stati: scheletri, vuota, nessun risultato, errore e "Riprova", offline con ultimo risultato.
- Riga: nome accessibile "titolo, autore"; etichetta di prestito solo se in prestito; tocco → scheda.
- Scheda: collocato e non collocato; in prestito; descrizione lunga richiusa e apribile; 404; ritorno con ricerca conservata.
- Bersagli tattili: le righe sono alte almeno 44px (controllo sul CSS).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile`, `npm test -w @bookeeper/i18n`, `npm run build -w @bookeeper/mobile` passano.
- Cambiano solo: file sotto `apps/mobile/src/modules/search/`, `packages/i18n/src/locales/{it,en}/msearch.json`.
