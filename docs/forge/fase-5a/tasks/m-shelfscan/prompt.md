Leggi prima `docs/forge/fase-5a/CONTRATTO.md` (API e indirizzi), `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md`. La task `core-append` è già unita. Leggi `apps/mobile/src/modules/scan` per intero, con i test: fotocamera, lettura dell'ISBN, ricerca e aggiunta esistono e si riusano.

# PWA: scan-a-scaffale

Riempire un ripiano scansionando i libri uno dopo l'altro, nell'ordine in cui stanno.

## Cosa fare

1. **Ingresso**: nella pagina "Scansiona" un bottone "Riempi un ripiano" porta a `/scan/shelf`. Solo per chi può modificare i libri.
2. **Scelta**: elenco dei mobili raggruppati per stanza, poi i ripiani del mobile scelto con "N libri · M posti liberi". Un ripiano pieno non si può scegliere.
3. **Sessione**: la fotocamera resta aperta. In alto mobile e ripiano scelti e il contatore dei libri collocati. A ogni codice letto:
   - **Libro della libreria**: collocato nel posto successivo (`PUT /books/{id}/placement` senza `slot_index`). Un riscontro breve: titolo e "posto N". Se era altrove, il riscontro dice "spostato da …".
   - **Libro già su questo ripiano**: riscontro "già qui", nessuna scrittura.
   - **Libro nuovo**: ricerca dell'ISBN come nella scansione normale; se trovato, creato e collocato senza altre domande; il riscontro dice "aggiunto". Se la ricerca non trova nulla, un foglio offre "Salta" o "Inserisci il titolo" (titolo obbligatorio, autore facoltativo), poi crea e colloca.
   - **`row_full`**: la sessione si ferma con "Il ripiano è pieno" e porta al riepilogo.
   - Lo stesso codice letto due volte di seguito entro tre secondi si ignora.
   - Inserimento a mano dell'ISBN disponibile come nella scansione normale.
4. **Annulla l'ultimo**: un bottone sempre visibile dopo il primo libro. Riporta l'ultimo libro dov'era prima (posizione precedente, oppure non collocato); se il libro era stato creato in questa sessione, lo elimina. Si può annullare solo l'ultimo passo, una volta.
5. **Fine**: "Ho finito" mostra il riepilogo: collocati, spostati, aggiunti, saltati, con l'elenco dei titoli nell'ordine di scansione, e i bottoni "Un altro ripiano" e "Chiudi".
6. Errori di rete: il passo non riuscito non entra nel conteggio; il riscontro offre "Riprova" per quel codice; la sessione continua.
7. La logica della sessione sta in un riduttore puro, provato senza fotocamera; la fotocamera e la rete stanno dietro le interfacce finte già usate dal modulo.

## Test

- Riduttore: ogni esito, doppia lettura, annulla per ciascuno dei tre casi (collocato, spostato, creato), ripiano pieno, errore e riprova.
- Scelta: gruppi per stanza, ripiano pieno non selezionabile.
- Sessione con fotocamera finta: tre libri in sequenza (noto, già qui, nuovo), annulla, riepilogo.
- Libro non trovato: salta, inserisci il titolo.
- Membro senza permesso: nessun ingresso, e `/scan/shelf` aperto a mano mostra che serve il permesso.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Nessun componente supera 250 righe. Nessun testo scritto nei componenti. Nessuna chiamata al client dentro un componente.
- A 320px nessuno scorrimento orizzontale; bersagli tattili di almeno 44×44px.
- Cambiano solo: file sotto `apps/mobile/src/modules/scan/`, i file i18n `mscan.json` (it e en).
