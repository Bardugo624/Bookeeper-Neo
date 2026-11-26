Leggi prima `docs/forge/fase-5a1/CONTRATTO.md`. Leggi `apps/mobile/src/modules/search/filters.test.tsx`, `apps/mobile/src/modules/search/where.test.tsx` e `apps/mobile/src/test-setup.ts`.

# PWA: due test che lasciano tracce

1. `filters.test.tsx` (circa riga 185): il test finge l'orologio con `vi.spyOn(Date, 'now')` e non lo ripristina; i test successivi del file girano con l'orologio fermo. Aggiungi il ripristino (`afterEach(() => vi.restoreAllMocks())` nel file, oppure nel blocco che lo usa).
2. `where.test.tsx` (circa riga 24): `HTMLElement.prototype.scrollIntoView` è sostituito con un'assegnazione diretta, che `vi.restoreAllMocks()` non annulla. Salva l'originale e rimettilo in `afterEach`, oppure usa `vi.spyOn` su una proprietà definita apposta.

Nessuna modifica al codice dell'app.

## Acceptance criteria

- `npm test -w @bookeeper/mobile` e `npm run typecheck -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/ui` passa.
- Cambiano solo: `apps/mobile/src/modules/search/filters.test.tsx`, `apps/mobile/src/modules/search/where.test.tsx`.
