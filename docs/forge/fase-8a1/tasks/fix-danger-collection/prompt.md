Leggi prima `docs/forge/fase-8a1/CONTRATTO.md`.

# Libri, prestiti, wishlist: conseguenze e resti

1. **[P3]** `books.selection.confirmText` (`books.json`, italiano e inglese): la conferma dell'eliminazione di più libri dice solo «con le copertine». Allineala alla conferma del libro singolo: posto sullo scaffale, prestiti, stati di lettura, tag, e che non si annulla.
2. **[P3]** `apps/desktop/src/modules/loans/LoanCard.tsx`: la conseguenza dell'eliminazione di un prestito è solo in un `title` (si vede col mouse, non da tastiera né al tocco). La conseguenza va detta nella conferma (`ConfirmDialog`), in una frase; il `title` si toglie.
3. **[P3]** `LoanCard.module.css`: il divisore prima di «Elimina» è una linea rossa piena su ogni scheda. Usa un separatore neutro (`--bk-border`); il rosso resta sul bottone.
4. **[P3]** `loans.danger.title` (`loans.json`, it e en) non è usato da nessuno: toglilo.
5. **[P3]** `apps/desktop/src/modules/wishlist/WishlistPage.tsx`: nel dialogo di modifica di una voce, «Elimina» nella zona sostituisce il modulo con la conferma; «Annulla» poi chiude tutto e le modifiche non salvate si perdono. «Annulla» deve tornare al modulo con le modifiche intatte.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/books/BookActions.test.tsx src/modules/loans src/modules/wishlist src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Ogni punto ha un test dove si può provare.
- Cambiano solo `apps/desktop/src/modules/loans/`, `apps/desktop/src/modules/wishlist/`, `apps/desktop/src/modules/books/SelectionBar.test.tsx` o `BookActions.test.tsx` se servono, e `books.json`, `loans.json` (it, en).
