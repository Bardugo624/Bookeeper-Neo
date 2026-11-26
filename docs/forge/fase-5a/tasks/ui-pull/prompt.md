Leggi prima `docs/forge/fase-5a/CONTRATTO.md` (sezione `packages/ui/shelf`), `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `packages/ui/src/shelf` per intero, con i test.

# Kit: il dorso che si sfila

## Cosa fare

1. `pulledId` su `ShelfUnit` e `ShelfBand`, `data-pulled` su `Spine`, come da contratto. Il dorso sfilato non copre il nome del ripiano e non esce dal mobile: lo spazio per lo spostamento è dentro la fascia.
2. Animazione in `Shelf.module.css`: uscita con la curva elastica dei token, tre pulsazioni di opacità di un alone nel colore d'accento, poi fermo. Con `prefers-reduced-motion: reduce`: nessun movimento, contorno d'accento fermo.
3. Il dorso sfilato viene portato in vista (`scrollIntoView` con `block: 'nearest'`, senza animazione se il movimento è ridotto) quando `pulledId` cambia.
4. `positionLabel` come da contratto, esportata da `@bookeeper/ui/shelf`.
5. Un test garantisce l'uso in sola lettura: senza `onSlotDrop` nessun dorso è `draggable` e nessun gestore di rilascio è attivo.

## Test

- `pulledId` segna un solo dorso; cambiarlo sposta il segno; toglierlo lo rimuove.
- `pulledId` e `selectedId` insieme su dorsi diversi.
- Sola lettura.
- `styles.test.ts` del pacchetto: nessun colore letterale, regola per il movimento ridotto presente.

## Acceptance criteria

- `npm test -w @bookeeper/ui` e `npm run typecheck -w @bookeeper/ui` passano.
- `npm run typecheck -w @bookeeper/desktop` e `npm run typecheck -w @bookeeper/mobile` passano (le proprietà nuove sono facoltative).
- Cambiano solo file sotto `packages/ui/src/shelf/`.
