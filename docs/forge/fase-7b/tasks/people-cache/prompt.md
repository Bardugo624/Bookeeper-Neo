Leggi prima `docs/forge/fase-7b/CONTRATTO.md`, `docs/forge/fase-7b/AUDIT.md`, `PRODUCT.md` e `DESIGN.md`. Leggi `apps/desktop/src/modules/people` per intero, `apps/desktop/src/modules/books/usePeople.ts`, `apps/desktop/src/modules/loans/useBorrowerSuggestions.ts` e i loro test.

# Desktop: la pagina Persone va in errore (P0)

Tre moduli usano la stessa chiave di cache `['people', connessione, 'list']` con forme diverse: Persone salva l'array, Libri e Prestiti salvano `{items}`. Aperta la scheda di un libro o un prestito, la pagina Persone va in errore ("Qualcosa non ha funzionato", `query.data.map is not a function`).

## Cosa fare

1. Una sola funzione per l'elenco delle persone, `usePeopleList()`, nel modulo Persone, esportata da `apps/desktop/src/modules/people/index.ts`. Restituisce l'array.
2. Libri e Prestiti la usano al posto delle loro query; i loro file che ripetevano la query si tolgono o diventano un richiamo a quella funzione.
3. Nessun altro cambiamento di comportamento.

## Test

- Con lo stesso `QueryClient`: si monta la scheda di un libro (o il suo hook delle persone), poi la pagina Persone: l'elenco si vede, nessun errore.
- Stessa prova con i suggerimenti del prestito.
- Cerca nel desktop le altre chiavi di query usate da più file con dati diversi (`git grep -n "queryKey: \["`): se ne trovi, elencale nel rapporto senza toccarle.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/people/`, `apps/desktop/src/modules/books/usePeople.ts`, `apps/desktop/src/modules/loans/useBorrowerSuggestions.ts` e i test che li usano.
