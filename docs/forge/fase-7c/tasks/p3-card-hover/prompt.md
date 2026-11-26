Leggi prima `docs/forge/fase-7b/CONTRATTO.md` (regole su Impeccable e sul movimento) e `DESIGN.md`, sezione del movimento. Leggi `apps/desktop/src/modules/books/BookCard.tsx`, `BookCard.module.css` e i loro test, e `packages/ui/src/book/BookCover.module.css` (regola `.lift:hover`).

# [P3] Card dei libri: etichette e copertina ruotano attorno a centri diversi

Al passaggio del puntatore la copertina si alza e ruota (`.lift:hover`). L'etichetta "In prestito" e l'anello o la spunta di lettura la seguono, ma ruotano attorno a un altro centro (`BookCard.module.css`, circa riga 43), così finiscono circa 1px lontano dagli angoli della copertina.

Regola: etichette e copertina condividono la stessa trasformazione con lo stesso centro, così restano solidali per tutta l'animazione; con `prefers-reduced-motion: reduce` nessuno si muove. Il nome accessibile del collegamento non cambia (nasce dal contenuto, senza `aria-label`). Nessun cambiamento in `packages/ui`.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano; `npm test -w @bookeeper/ui` passa.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/books/`.
