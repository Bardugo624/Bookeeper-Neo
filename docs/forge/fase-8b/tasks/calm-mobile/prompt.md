Leggi prima `docs/forge/fase-8b/CONTRATTO.md`, `docs/forge/fase-8b/request.md` e la sezione «Zona pericolosa» di `DESIGN.md`.

# PWA: niente zona fissa nella wishlist

1. **Foglio di una voce della wishlist** (`apps/mobile/src/modules/wishlist/WishSheet.tsx`): togli la `DangerZone`. «Elimina» è un bottone normale tra le azioni del foglio, non rosso, alto almeno 44 px. Premendolo si apre la conferma rossa (`Dialog` con `tone="danger"`), con la conseguenza; i bottoni della conferma restano alti almeno 44 px.
2. **Account** (`modules/account/LogoutSection.tsx`): la zona fissa di «Scollega questo telefono» resta com'è (sono le impostazioni del telefono).
3. **Lettura** (`modules/reading/StatusSheet.tsx`): resta com'è.
4. Togli i testi rimasti senza uso in `mwishlist.json` (it, en).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile` passa; `npx vitest run src/modules/wishlist src/modules/account src/styles.test.ts` (da `apps/mobile`) passa; `npm test -w @bookeeper/i18n` passa.
- Test: nessuna zona nel foglio; «Elimina» neutro; conferma rossa con la conseguenza; l'eliminazione funziona come prima.
- Cambiano solo file sotto `apps/mobile/src/modules/wishlist/` e `mwishlist.json` (it, en).
