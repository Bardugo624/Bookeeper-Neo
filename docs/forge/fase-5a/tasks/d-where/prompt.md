Leggi prima `docs/forge/fase-5a/CONTRATTO.md`, `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`. La task `ui-pull` è già unita. Leggi `apps/desktop/src/modules/shelves`, `apps/desktop/src/modules/books/DetailAside.tsx` e la parte "Dov'è?" di `apps/desktop/src/modules/palette`.

# Desktop: "Dov'è?" completo

## Cosa fare

1. `/shelves?unit=<id>&book=<id>`: il dorso del libro si sfila (`pulledId`) e sopra il mobile compare una riga con la frase "«Titolo» · Mobile · ripiano 3 · posto 12" e un bottone "Fatto" che toglie `book` dall'indirizzo e rimette il dorso a posto. La frase è annunciata alle tecnologie assistive (`role="status"`). `Esc` equivale a "Fatto".
2. Se `book` non è su quel mobile (spostato nel frattempo), si cerca dove sta ora e si corregge l'indirizzo; se non è collocato, la riga dice "Non è su nessuno scaffale" con il bottone "Colloca in…".
3. La stessa frase della posizione, con ripiano e posto, compare nel blocco "Dove si trova" della scheda del libro e nella riga "Dov'è?" della palette (oggi mostrano mobile e ripiano).
4. **Dall'elenco dei libri**: nella griglia e nella tabella, il menu della riga (o l'azione al passaggio, come le altre già presenti) offre "Dov'è?" per i libri collocati; porta a `/shelves?unit=&book=`.
5. Una sola funzione compone la frase, usata nei tre punti; i testi stanno in i18n con le forme plurali dove servono.

## Test

- Indirizzo con `book`: dorso sfilato, frase, "Fatto", `Esc`.
- Libro spostato: indirizzo corretto. Libro non collocato: messaggio e "Colloca in…".
- Scheda e palette: frase con ripiano e posto contati da 1.
- Elenco: "Dov'è?" solo per i libri collocati; griglia e tabella.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Nessun componente supera 250 righe. Nessun testo scritto nei componenti.
- Cambiano solo: file sotto `apps/desktop/src/modules/shelves/`, `apps/desktop/src/modules/books/`, `apps/desktop/src/modules/palette/`, i file i18n `shelves.json`, `books.json`, `palette.json` (it e en).
