Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Zona pericolosa»), `PRODUCT.md` e `DESIGN.md` (sezione «Zona pericolosa»). Sono già unite `kit-danger-zone` (`DangerZone`, `DangerAction`, `Dialog` con `tone="danger"`) e `kit-danger-tones`.

# PWA: zona pericolosa sul telefono

## Cosa

Applica la regola della zona pericolosa alla PWA (`apps/mobile`). Setup di Impeccable da `apps/mobile` con `--target src/modules/account`; leggi `reference/harden.md`, `reference/adapt.md` e `reference/craft-floor.md`. Sul telefono: bersagli ≥ 44×44 px, niente scorrimento orizzontale a 320 px, testo dei campi ≥ 16 px.

1. **Account**: «Scollega questo telefono» (`modules/account/LogoutSection.tsx`) va in una `DangerZone` in fondo alla pagina, con la conseguenza (per riaverlo serve un nuovo codice o il QR dal computer). La conferma usa il `Dialog` con `tone="danger"`.
2. **Wishlist**: nel foglio di una voce (`modules/wishlist/WishSheet.tsx`) «Elimina» sta in una `DangerZone` in fondo al foglio; la conferma resta, col tono.
3. **Lettura**: nel foglio dello stato (`modules/reading/StatusSheet.tsx`) l'opzione che cancella lo stato sta in fondo, separata dalle altre da un divisore, in rosso.
4. Testi: «Zona pericolosa» e le conseguenze nei file i18n `maccount`, `mwishlist`, `mreading` (italiano e inglese).

## Test

- La zona dell'account c'è, ha il suo nome e contiene «Scollega questo telefono», che funziona come prima; la conferma ha il tono.
- Nel foglio della wishlist «Elimina» è nella zona; l'eliminazione funziona come prima.
- Nel foglio della lettura l'opzione che cancella è l'ultima, dopo il divisore.
- I test esistenti dei moduli toccati passano, aggiornati dove cercano le azioni nel posto vecchio.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile` passa; `npx vitest run src/modules/account src/modules/wishlist src/modules/reading` (da `apps/mobile`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/mobile/src/modules/account/`, `wishlist/`, `reading/`, e i file i18n `maccount`, `mwishlist`, `mreading` (it, en).
