Leggi prima `docs/forge/fase-8b/CONTRATTO.md`, `docs/forge/fase-8b/request.md` e la sezione «Zona pericolosa» di `DESIGN.md`.

# Scaffali e stanze: niente zona fissa, il rosso nella conferma

1. **Pannello del mobile** (`modules/shelves/ShelfPanel.tsx`): togli la `DangerZone` in fondo; l'icona del cestino torna in alto accanto alla matita, neutra, come nella 2.0.0 (`git show f4187c9:apps/desktop/src/modules/shelves/ShelfPanel.tsx`). La conferma è rossa (`tone="danger"`) e dice la conseguenza: i libri collocati restano in biblioteca, non collocati.
2. **Stanze** (`RoomsDialog.tsx`): il comando di eliminazione torna neutro; conferma rossa con la conseguenza.
3. Togli i testi rimasti senza uso in `shelves.json` (it, en).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/shelves src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Test per ogni punto: nessuna zona; il comando al suo posto e neutro; conferma con tono e conseguenza; permessi come prima. Il test «keeps the delete action in the danger zone at the bottom of the panel» di `ShelfForm.test.tsx` diventa la prova del nuovo posto.
- Cambiano solo file sotto `apps/desktop/src/modules/shelves/` e `shelves.json` (it, en).
