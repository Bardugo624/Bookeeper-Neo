Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Zona pericolosa»), `PRODUCT.md` e `DESIGN.md` (sezione «Zona pericolosa»). Sono già unite `kit-danger-zone`, `kit-danger-tones`, le task del pop-up dei libri e quelle del tour.

# Desktop: zona pericolosa in scaffali, prestiti e wishlist

## Cosa

Applica la regola della zona pericolosa a scaffali, prestiti e wishlist. Setup di Impeccable da `apps/desktop` con `--target src/modules/shelves`; leggi `reference/harden.md` e `reference/craft-floor.md`. Comportamento, conferme e permessi restano com'erano: cambia dove stanno le azioni e come si vedono, e ogni azione dice la sua conseguenza.

1. **Scaffali**: nel pannello del mobile (`ShelfPanel.tsx`) «Elimina mobile» lascia l'icona del cestino in alto e va in una `DangerZone` in fondo al pannello (la modifica resta in alto). Conseguenza: i libri collocati restano in biblioteca, non collocati. Nelle stanze (`RoomsDialog.tsx`) l'eliminazione di una stanza usa `IconButton` con `tone="danger"`.
2. **Prestiti** (`LoanCard.tsx`): «Elimina» staccato dalle altre azioni della scheda, con `tone="danger"`; la conferma col tono.
3. **Wishlist**: il cestino della scheda (`WishCard.tsx`) usa `tone="danger"`; nel dialogo di modifica di una voce esistente (`WishFormDialog.tsx`) «Elimina» sta in una `DangerZone` in fondo.
4. Le conferme di eliminazione passano da `ConfirmDialog` con `tone="danger"`.
5. Testi: «Zona pericolosa» e le conseguenze in `shelves.json`, `loans.json`, `wishlist.json` (italiano e inglese).

## Test

- «Elimina mobile» è nella zona in fondo al pannello, con il suo nome, e funziona come prima; un ospite non la vede.
- Prestiti, wishlist e stanze: le azioni di eliminazione si riconoscono come pericolose e funzionano come prima; le conferme hanno il tono `danger`; la zona del dialogo della wishlist c'è solo per una voce esistente.
- I test esistenti dei moduli toccati passano, aggiornati dove cercano le azioni nel posto vecchio.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/shelves src/modules/loans src/modules/wishlist` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/shelves/`, `loans/`, `wishlist/`, e `shelves.json`, `loans.json`, `wishlist.json` (it, en).
