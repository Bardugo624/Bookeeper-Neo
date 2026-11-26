Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/src/kit`, il modulo che tocchi e i suoi test. Per il comportamento guarda il modulo corrispondente del desktop: si legge, non si importa. La task `m-wishlist` è già unita: parti dal suo codice. Leggi `apps/mobile/src/modules/scan` per intero, `apps/mobile/src/shell` e `apps/mobile/src/app/types.ts`.

# PWA: anti-doppio-acquisto senza rete

## Cosa fare

1. **Indice locale** in `apps/mobile/src/modules/scan/libraryIndex/`: un'interfaccia `LibraryIndex` con `get(isbn)`, `replace(version, items, syncedAt)` e `meta()`, e due implementazioni: IndexedDB (API del browser, nessuna libreria; un database per libreria) e in memoria per i test.
2. **Sincronizzazione**: componente `background` del modulo scan, come da contratto. Parte all'avvio se c'è rete, poi ogni 10 minuti, all'evento `online` e dopo le scritture sui libri (ascolta l'invalidazione delle query dei libri). Usa `isbnIndex(version)`; con `unchanged` non riscrive nulla. Se fallisce, nessun errore visibile.
3. **Scansione**: al codice letto si guarda prima l'indice locale.
   - Trovato: subito il foglio "Ce l'hai già", con titolo e posizione dall'indice, anche senza rete. Con la rete, poi si aggiorna con i dati del server come oggi.
   - Non trovato, senza rete: foglio "Non risulta nella tua libreria" con "Dati aggiornati alle 14:32", senza ricerca online.
   - Non trovato, con la rete: il flusso di oggi.
4. `MobileModule.background` e il suo montaggio nella shell a sessione aperta, come da contratto.
5. L'adattatore IndexedDB resta sottile. Tutta la logica (sincronizzazione, scelta del foglio) si prova con l'implementazione in memoria.

## Test

- Sincronizzazione: prima volta, `unchanged`, errore silenzioso, evento `online`, dopo una scrittura.
- Scansione: trovato con e senza rete; non trovato senza rete; non trovato con la rete.
- `background` montato solo a sessione aperta.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- A 320px nessuno scorrimento orizzontale della pagina; bersagli tattili di almeno 44×44px; campi con testo di almeno 16px.
- Cambiano solo: file sotto `apps/mobile/src/modules/scan/`, `apps/mobile/src/app/types.ts`, file sotto `apps/mobile/src/shell/`, i file i18n `mscan.json` (it e en).
