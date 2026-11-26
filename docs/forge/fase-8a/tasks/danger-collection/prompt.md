Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Zona pericolosa»), `PRODUCT.md` e `DESIGN.md` (sezione «Zona pericolosa»). Sono già unite `kit-danger-zone`, `kit-danger-tones`, le task del pop-up dei libri e quelle del tour.

# Desktop: zona pericolosa in libri, scaffali, prestiti, wishlist, tag

## Cosa

Applica la regola della zona pericolosa a queste superfici. Setup di Impeccable da `apps/desktop` con `--target src/modules/books`; leggi `reference/harden.md` e `reference/craft-floor.md`. Comportamento, conferme e permessi restano com'erano: cambia dove stanno le azioni e come si vedono, e ogni azione dice la sua conseguenza.

1. **Scheda del libro**: «Elimina libro» esce dal menu «Altro» della barra (`DetailToolbar.tsx`) e va in una `DangerZone` in fondo alla pagina del libro. Conseguenza: spariscono anche il suo posto sullo scaffale, i prestiti e gli stati di lettura (verifica nel core cosa si cancella davvero e scrivi quello).
2. **Selezione di più libri** (`SelectionBar.tsx`): «Elimina» staccato dalle altre azioni, rosso; la conferma col tono `danger`.
3. **Scaffali**: nel pannello del mobile (`ShelfPanel.tsx`) «Elimina mobile» lascia l'icona del cestino in alto e va in una `DangerZone` in fondo al pannello (la modifica resta in alto). Conseguenza: i libri collocati restano in biblioteca, non collocati. Nelle stanze (`RoomsDialog.tsx`) l'eliminazione di una stanza usa `IconButton` con `tone="danger"`.
4. **Prestiti** (`LoanCard.tsx`): «Elimina» staccato dalle altre azioni della scheda, con `tone="danger"`; la conferma col tono.
5. **Wishlist**: il cestino della scheda (`WishCard.tsx`) usa `tone="danger"`; nel dialogo di modifica di una voce esistente (`WishFormDialog.tsx`) «Elimina» sta in una `DangerZone` in fondo.
6. **Tag** (`modules/tags/ManageTagsDialog.tsx`): l'eliminazione di un tag usa `tone="danger"`; la conferma col tono.
7. Tutte le conferme di eliminazione passano da `ConfirmDialog` con `tone="danger"` (o dal `Dialog` col tono).
8. Testi: «Zona pericolosa» e le conseguenze nei file i18n dei moduli (italiano e inglese).

## Test

- Ogni zona c'è, ha il suo nome, contiene le azioni giuste; le azioni funzionano come prima (stesse conferme, stessi permessi: un ospite non vede nulla).
- «Elimina libro» non è più nel menu «Altro» ed è nella zona in fondo alla pagina; «Elimina mobile» è nella zona del pannello.
- Le conferme distruttive hanno il tono `danger`.
- I test esistenti dei moduli toccati passano, aggiornati dove cercano le azioni nel posto vecchio.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/books src/modules/shelves src/modules/loans src/modules/wishlist src/modules/tags` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/books/`, `shelves/`, `loans/`, `wishlist/`, `tags/`, e i file i18n `books`, `shelves`, `loans`, `wishlist`, `tags` (it, en).
