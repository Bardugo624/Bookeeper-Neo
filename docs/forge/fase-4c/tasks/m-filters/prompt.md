Leggi prima `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/src/kit`, `apps/mobile/src/modules/search` e i suoi test. Per il comportamento guarda il corrispondente desktop (`apps/desktop/src/modules/reading`, `apps/desktop/src/modules/tags`, `apps/desktop/src/modules/books`): si legge, non si importa.

Le task `m-reading` e `m-tags` sono già unite: parti dal loro codice.

# PWA: filtri nella ricerca

## Cosa fare

1. `searchState` legge e scrive gli indirizzi del contratto: `reading`, `tag` ripetibile, `room`. Valori sconosciuti ignorati.
2. `useBookSearch` passa i filtri a `GET /books` (`reading`, `tag_id` ripetuto, `room_id`) e li mette nella chiave della query.
3. **Barra dei filtri rapidi**: a "Tutti", "In prestito", "Non collocati" si aggiungono "Da leggere", "In lettura", "Letti". La barra scorre in orizzontale dentro di sé senza far scorrere la pagina. Stato di lettura e filtro rapido esistente si combinano.
4. **Bottone "Filtri"** con il numero dei filtri attivi: apre un `BottomSheet` con stato di lettura (inclusi "Abbandonato" e "Senza stato"), tag a caselle con conteggi da `GET /books/facets`, stanza (elenco da `GET /rooms`). "Mostra N libri" applica e chiude; "Azzera" toglie tutto. Le sezioni senza voci non si mostrano.
5. **Filtri attivi** sotto la barra: un'etichetta per ogni filtro del foglio, ognuna con il suo bottone per toglierlo (nome accessibile "Togli il filtro …").
6. Stato vuoto con filtri attivi: testo dedicato e bottone "Azzera i filtri".

## Test

- Indirizzo → stato → richiesta, per ogni filtro e per più tag.
- Filtri rapidi di lettura; combinazione con "In prestito".
- Foglio: scelta, conteggi, applica, azzera; sezione vuota nascosta.
- Etichette dei filtri attivi e rimozione.
- Ritorno dalla scheda con gli stessi filtri.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- A 320px di larghezza nessuno scorrimento orizzontale; bersagli tattili di almeno 44×44px; campi con testo di almeno 16px.
- Cambiano solo: file sotto `apps/mobile/src/modules/search/`, i file i18n `msearch.json` (it e en).
