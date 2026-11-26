Leggi prima `docs/forge/fase-8b/CONTRATTO.md`, `docs/forge/fase-8b/request.md` e la sezione «Zona pericolosa» di `DESIGN.md`.

# Prestiti: niente divisore, il rosso nella conferma

1. **Scheda del prestito** (`modules/loans/LoanCard.tsx` e `.module.css`): «Elimina» torna com'era nella 2.0.0 (`git show f4187c9:apps/desktop/src/modules/loans/LoanCard.tsx`), tra le altre azioni, neutro; niente divisore apposta. La conferma resta rossa (`tone="danger"`) con la conseguenza scritta nel run 8A1.
2. Togli i testi rimasti senza uso in `loans.json` (it, en).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/loans src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Test: il comando al suo posto e neutro, senza divisore; conferma con tono e conseguenza; permessi come prima.
- Cambiano solo file sotto `apps/desktop/src/modules/loans/` e `loans.json` (it, en).
