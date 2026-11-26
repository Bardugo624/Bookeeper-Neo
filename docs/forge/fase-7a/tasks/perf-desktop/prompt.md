Leggi prima `docs/forge/fase-7a/CONTRATTO.md`. Leggi `apps/desktop/src/modules/books` (`BooksPage.tsx`, `BookGrid.tsx`, `BookTable.tsx`, `useBookList.ts`) con i test, e `apps/desktop/src/modules/shelves/UnshelvedList.tsx`.

# Desktop: liste lunghe

Con 10.000 libri e lo scorrimento infinito, la griglia e la tabella dei Libri finiscono per avere migliaia di elementi nel DOM, e la pagina rallenta.

## Cosa fare

1. **Rendering a finestra** per griglia e tabella dei Libri: nel DOM stanno solo le righe visibili più un margine (per la griglia, le righe di copertine; per la tabella, le righe). Lo scorrimento resta quello della pagina; l'altezza totale è quella di tutte le righe caricate. Nessuna libreria: un piccolo hook nel modulo, provato con misure finte come fanno i test del trascinamento (`shelves/dnd.ts`).
2. La selezione multipla, la tastiera (frecce, Invio), il fuoco e "torna dove eri" dopo la scheda continuano a funzionare. L'elemento con il fuoco non viene mai tolto dal DOM mentre ha il fuoco.
3. Stessa regola per l'elenco dei non collocati negli Scaffali, se supera 200 righe.
4. Pagine caricate: restano quelle di oggi (`PAGE_SIZE` 60).

## Test

- Con 2.000 libri finti: nel DOM al più 200 copertine o righe, qualunque sia la posizione di scorrimento.
- Scorrimento simulato: le righe giuste compaiono.
- Selezione, tastiera e fuoco come oggi (i test esistenti restano verdi).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/ui` passa.
- Cambiano solo file sotto `apps/desktop/src/modules/books/` e `apps/desktop/src/modules/shelves/`.
