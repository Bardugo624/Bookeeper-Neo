Leggi prima `docs/forge/fase-7b1/CONTRATTO.md`. Le task `ui-fix-desktop` e `ui-fix-mobile` sono già unite. Leggi `apps/desktop/src/modules/palette/CommandPalette.test.tsx`, `apps/desktop/src/modules/books/BookCard.tsx` con il suo foglio di stile e i suoi test, e `packages/ui/src/book/BookCover.module.css` (regola `.lift:hover`).

# Due coda del run 7B1

1. **Test della palette** (`palette/CommandPalette.test.tsx`, circa riga 37): il test "opens from the hint in the sidebar" cerca un bottone chiamato `/Cerca o lancia/`, ma il suggerimento della barra laterale ora dice "Cerca e comandi". La verifica del run fallisce per questo. Regola: il test prende il nome atteso dal testo del suggerimento, non da una frase scritta a mano, così non si rompe al prossimo cambio di testo.
2. **[P3] Card dei libri** (`books/BookCard.tsx`, circa riga 61): l'etichetta "In prestito" e l'anello o la spunta di lettura ora stanno accanto alla copertina invece che dentro. Al passaggio del puntatore la copertina si alza (`.lift:hover`) e loro restano ferme; portando il puntatore sopra di loro, l'effetto si spegne e riaccende. Regola: si muovono con la copertina e non interrompono l'effetto. Il nome accessibile del collegamento resta quello corretto da `ui-fix-desktop`: nasce dal contenuto, nell'ordine titolo, autore, "In prestito", stato di lettura, senza `aria-label`.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/ui` passa.
- Cambiano solo `apps/desktop/src/modules/palette/CommandPalette.test.tsx` e file sotto `apps/desktop/src/modules/books/`.
