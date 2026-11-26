Leggi prima `docs/forge/fase-8b/CONTRATTO.md`, `docs/forge/fase-8b/request.md` e la sezione «Zona pericolosa» di `DESIGN.md`.

# Scaffali, stanze, prestiti, wishlist: niente zona fissa, il rosso nella conferma

1. **Pannello del mobile** (`modules/shelves/ShelfPanel.tsx`): togli la `DangerZone` in fondo; l'icona del cestino torna in alto accanto alla matita, neutra, come nella 2.0.0. La conferma è rossa e dice la conseguenza (i libri collocati restano in biblioteca, non collocati).
2. **Stanze** (`RoomsDialog.tsx`): il comando di eliminazione torna neutro; conferma rossa con la conseguenza.
3. **Prestiti** (`modules/loans/LoanCard.tsx` e `.module.css`): «Elimina» torna com'era nella 2.0.0, tra le altre azioni, neutro; niente divisore apposta. La conferma resta rossa con la conseguenza scritta nel run 8A1.
4. **Wishlist**: il cestino della scheda (`WishCard.tsx`) torna neutro; dal dialogo di modifica (`WishFormDialog.tsx`, `WishlistPage.tsx`) togli la zona e l'eliminazione, che nella 2.0.0 lì non c'era, con il codice che serviva solo a lei (il ritorno al modulo dopo «Annulla»). La conferma dalla scheda è rossa e dice la conseguenza.
5. Togli i testi rimasti senza uso in `shelves.json`, `loans.json`, `wishlist.json` (it, en).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/shelves src/modules/loans src/modules/wishlist src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Test per ogni punto: nessuna zona; il comando al suo posto e neutro; conferma con tono e conseguenza; permessi come prima.
- Cambiano solo file sotto `apps/desktop/src/modules/shelves/`, `loans/`, `wishlist/`, e `shelves.json`, `loans.json`, `wishlist.json` (it, en).
