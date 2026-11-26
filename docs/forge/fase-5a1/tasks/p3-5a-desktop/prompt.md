Leggi prima `docs/forge/fase-5a1/CONTRATTO.md` e `docs/forge/fase-5a/CONTRATTO.md`. Leggi `apps/desktop/src/modules/shelves` e `apps/desktop/src/modules/books/BookCard.tsx` con i test.

# Desktop: quattro difetti P3 del run 5A

1. `shelves/useShelvesView.ts`: con un filtro per stanza nell'indirizzo e `book` su un mobile di un'altra stanza, la pagina scrive `unit=<altro>` ma mostra il primo mobile della stanza filtrata, senza riga "Dov'è?". Regola: "Dov'è?" vince sul filtro: il filtro per stanza si toglie dall'indirizzo e si apre il mobile giusto.
2. `books/BookCard.module.css`: il segnaposto "Dov'è?" compare in alto a sinistra, sopra l'etichetta "In prestito". Regola: i due non si sovrappongono mai (segnaposto in alto a destra, oppure sotto l'etichetta); bersaglio di almeno 32×32px; visibile al passaggio e al fuoco da tastiera.
3. `shelves/useWhere.ts`: se la ricerca del libro fallisce (eliminato, 404, rete), la riga non mostra nulla. Regola: 404 → "Questo libro non c'è più" con "Fatto"; altri errori → messaggio d'errore con "Riprova".
4. `shelves/useMoveWrites.ts` (`placeFirstFree`): scrive le modifiche ottimistiche senza prima `cancelQueries`, e non è una mutazione, quindi non ha stato "in corso". Regola: annulla le letture in volo delle liste toccate prima di scrivere, come fa `usePlacement`; durante la scrittura le linguette non accettano un secondo rilascio.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Cambiano solo: file sotto `apps/desktop/src/modules/shelves/`, `apps/desktop/src/modules/books/`, i file i18n `shelves.json` e `books.json` (it e en).
