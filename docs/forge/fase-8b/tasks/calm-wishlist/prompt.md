Leggi prima `docs/forge/fase-8b/CONTRATTO.md`, `docs/forge/fase-8b/request.md` e la sezione «Zona pericolosa» di `DESIGN.md`.

# Wishlist: niente zona nel dialogo, il rosso nella conferma

1. **Scheda** (`modules/wishlist/WishCard.tsx`): il cestino torna neutro, come nella 2.0.0 (`git show f4187c9:apps/desktop/src/modules/wishlist/WishCard.tsx`). La conferma è rossa (`tone="danger"`) e dice la conseguenza.
2. **Dialogo di modifica** (`WishFormDialog.tsx`, `WishlistPage.tsx`): togli la zona e l'eliminazione, che nella 2.0.0 lì non c'era, con il codice che serviva solo a lei (il ritorno al modulo dopo «Annulla»).
3. Togli i testi rimasti senza uso in `wishlist.json` (it, en).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/wishlist src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Test per ogni punto: nessuna zona nel dialogo; il cestino della scheda neutro; conferma con tono e conseguenza; permessi come prima.
- Cambiano solo file sotto `apps/desktop/src/modules/wishlist/` e `wishlist.json` (it, en).
