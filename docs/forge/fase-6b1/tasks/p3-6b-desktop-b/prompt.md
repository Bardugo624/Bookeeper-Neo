Leggi prima `docs/forge/fase-6b1/CONTRATTO.md`, `docs/forge/fase-6b/CONTRATTO.md` e `docs/forge/fase-6a/CONTRATTO.md`. Leggi ogni file citato e i suoi test prima di cambiarlo. Leggi `apps/desktop/src/modules/loans/loanStatus.ts`, `loanForm.ts`, `apps/desktop/src/modules/books/useActiveFilters.ts`, `FilterGroups.tsx`, `apps/desktop/src/modules/shelves/useShelvesView.ts` e `useWhere.ts`.

# Desktop: prestiti, filtri, "Dov'è?"

1. **Prestito a sé stessi** (`loans/loanStatus.ts`, circa riga 31): la card dice "A Anna" invece di "A te"/"Tu". Regola del contratto 6B: chi chiama è "Tu". Vale nella card, nell'etichetta del nome e nel campo della persona quando si modifica il prestito (`loanForm.ts`, circa riga 31).
2. **Proprietario senza libri** (`books/useActiveFilters.ts`, circa riga 55): con `?owner=<id>` di una persona che non possiede libri, l'etichetta del filtro mostra l'id e il pannello non ha il bottone di quella persona. Regola: il nome viene da `GET /users` quando le faccette non lo hanno; nel pannello la persona scelta compare con conteggio 0, così si può togliere.
3. **"Dov'è?" e stanza vuota** (`shelves/useShelvesView.ts`, circa riga 50): con un filtro per una stanza senza mobili e un libro non collocato, eliminato o non leggibile, il filtro resta e la riga di "Dov'è?" non si vede. Regola del run 5A1: con `book` nell'indirizzo, "Dov'è?" vince sempre; il filtro per stanza si toglie anche quando il libro non ha un mobile, e la riga mostra il suo messaggio ("Non è su nessuno scaffale", "Questo libro non c'è più", errore con "Riprova").

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Cambiano solo: file sotto `apps/desktop/src/modules/loans/`, `apps/desktop/src/modules/books/`, `apps/desktop/src/modules/shelves/`, i file i18n `loans.json`, `books.json` e `shelves.json` (it e en).
