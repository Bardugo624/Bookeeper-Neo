Leggi prima `docs/forge/fase-5a1/CONTRATTO.md` e la sezione `packages/ui/shelf` di `docs/forge/fase-5a/CONTRATTO.md`. Leggi `packages/ui/src/shelf` con i test e `packages/ui/src/tokens.css`.

# Kit: tre difetti P3 del dorso sfilato

1. `Shelf.module.css`: la pulsazione dura `700ms` scritti a mano. Usa un token di durata di `tokens.css` (il più vicino; se serve un multiplo, `calc()` su un token).
2. `ShelfBand.tsx`: l'effetto che porta in vista il dorso sfilato dipende anche da `row.books`, quindi riporta la pagina sul dorso a ogni ricaricamento dei libri. Regola: scorre solo quando `pulledId` cambia, e quando il dorso con quell'id compare per la prima volta (dati arrivati dopo). Test per i tre casi: cambio di `pulledId`, comparsa tardiva, ricaricamento senza cambi (nessuno scorrimento).
3. `Shelf.module.css`: lo spazio aggiunto per lo sfilamento viene tolto all'altezza fissa della fascia (`box-sizing: border-box`), così ogni dorso è più basso di circa il 10% rispetto a prima del run 5A. Regola: l'area utile dei dorsi torna quella di prima (126px); lo spazio per lo sfilamento si aggiunge all'altezza della fascia oppure si ricava senza ridurre i dorsi. Il dorso sfilato non esce dal mobile e non copre il nome del ripiano. Aggiungi a `styles.test.ts` un controllo che leghi altezza della fascia, spazio e area utile.

## Acceptance criteria

- `npm test -w @bookeeper/ui` e `npm run typecheck -w @bookeeper/ui` passano.
- `npm test -w @bookeeper/desktop -- src/modules/shelves` e `npm test -w @bookeeper/mobile -- src/modules/search` passano.
- Cambiano solo file sotto `packages/ui/src/shelf/`.
