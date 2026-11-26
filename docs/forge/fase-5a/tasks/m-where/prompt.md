Leggi prima `docs/forge/fase-5a/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-3a/CONTRATTO.md`. La task `ui-pull` è già unita. Leggi `apps/mobile/src/modules/search` con i test e, per il comportamento, `apps/desktop/src/modules/shelves/ShelfCabinet.tsx` (si legge, non si importa).

# PWA: "Dov'è?" e un difetto dei filtri

## "Dov'è?"

1. Nel blocco "Dove si trova" della scheda del libro, per un libro collocato: la frase "Mobile · ripiano 3 · posto 12" e il bottone "Dov'è?" che porta a `/books/:id/where`.
2. Pagina `/books/:id/where` (nel modulo `search`): titolo del libro, la frase della posizione (`role="status"`), il mobile disegnato con `ShelfUnit` di `@bookeeper/ui/shelf` in sola lettura, con il dorso del libro sfilato (`pulledId`). Il mobile scorre in orizzontale dentro di sé se è più largo dello schermo; la pagina no. Il dorso sfilato è portato in vista.
3. Libro non collocato o spostato: stessa regola del desktop (messaggio "Non è su nessuno scaffale"; nessun bottone di scrittura).
4. Il tasto indietro torna alla scheda, che torna all'elenco con i suoi filtri.

## Difetto P3 dal run 4C1

`apps/mobile/src/modules/search/FilterSheet.tsx`: quando un risultato precedente di faccette o stanze è in cache e l'aggiornamento fallisce, si disegnano insieme la sezione d'errore e l'elenco normale: due `<section>` con la stessa intestazione e `id` doppi (`msf-tags`, `msf-room`). Regola: con dati in cache si mostra l'elenco e, sotto, una riga d'avviso con "Riprova" nella stessa sezione; senza dati, solo l'errore. Mai due sezioni né `id` doppi.

## Test

- Scheda: frase e bottone solo per i libri collocati.
- Pagina: frase, dorso sfilato, nessun gesto di scrittura, non collocato, ritorno.
- Foglio dei filtri: cache più errore → una sezione sola, `id` unici.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- A 320px nessuno scorrimento orizzontale della pagina; bersagli tattili di almeno 44×44px.
- Cambiano solo: file sotto `apps/mobile/src/modules/search/`, i file i18n `msearch.json` (it e en).
