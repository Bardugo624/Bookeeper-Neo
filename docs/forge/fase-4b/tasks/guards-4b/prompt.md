Leggi prima `docs/forge/fase-4b/CONTRATTO.md` e `docs/forge/fase-2a/CONTRATTO.md`.

# App: due controlli di qualità falliti

La verifica del run fallisce su due test di guardia.

1. **Nomi di file che differiscono solo per maiuscole** (`packages/ui/src/caseCollisions.test.ts`): in `apps/desktop/src/modules/books/` collidono `ActiveFilters.tsx` con `activeFilters.test.tsx`, e `SavedViews.tsx` con `savedViews.test.tsx`. Rinomina con `git mv` i file di test perché abbiano le stesse maiuscole del file che provano (`ActiveFilters.test.tsx`, `SavedViews.test.tsx`). Nessuna modifica di contenuto. Poi esegui il test e correggi allo stesso modo ogni altro gruppo che segnala sotto `apps/`.
2. **Colore scritto in un foglio di stile** (`apps/desktop/src/kit/styles.test.ts`): `apps/desktop/src/modules/loans/BorrowerInput.module.css` contiene un `rgb(`. Sostituiscilo con un token esistente di `packages/ui/src/tokens.css` (ombra, bordo o velatura più vicina all'intento), senza cambiare l'aspetto in modo evidente. Poi esegui il test e correggi ogni altro foglio che segnala.

## Acceptance criteria

- `npm test -w @bookeeper/ui` e `npm test -w @bookeeper/desktop` passano.
- `npm run typecheck -w @bookeeper/desktop` passa.
- Cambiano solo file sotto `apps/desktop/src/`.
