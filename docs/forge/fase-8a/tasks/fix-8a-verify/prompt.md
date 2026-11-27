Leggi prima `docs/forge/fase-8a/CONTRATTO.md`. Sono già unite `tour-core` (modulo `apps/desktop/src/modules/tour/`) e `kit-danger-tones` (nel `Menu` del kit le voci con `danger: true` vanno sempre in fondo, dopo un divisore).

# Verifica del run: due test del desktop

La verifica completa del run dopo quelle due task fallisce in due punti. Sono errori di piano: i due file non erano tra quelli delle task.

1. **`src/kit/styles.test.ts` → «modules/tour/CoachCard.module.css uses only existing tokens».** Il foglio usa `var(--tour-arrow)` quattro volte, senza che la variabile sia definita in un foglio né abbia un valore di riserva: il test vuole solo token esistenti o `var(--x, riserva)`. Definisci la variabile nel foglio stesso con un valore iniziale sensato (o dai la riserva), senza cambiare l'aspetto della scheda quando il componente la imposta.
2. **`src/modules/people/people.test.tsx` → «menu by role › lets the owner manage everybody else, without leaving».** Il test si aspetta `['Cambia ruolo', 'Rinomina', 'Rimuovi', 'Rendi proprietario']`; il menu ora dà `['Cambia ruolo', 'Rinomina', 'Rendi proprietario', 'Rimuovi']`, perché «Rimuovi» è pericolosa e il kit la mette in fondo. È il comportamento voluto: aggiorna l'attesa del test, e dove il test lo permette controlla anche che «Rimuovi» venga dopo il divisore.

Non cambiare altro.

## Acceptance criteria

- `npx vitest run src/kit/styles.test.ts src/modules/people src/modules/tour` (da `apps/desktop`) passa.
- `npm run typecheck -w @bookeeper/desktop` passa.
- Cambiano solo `apps/desktop/src/modules/tour/CoachCard.module.css` e `apps/desktop/src/modules/people/people.test.tsx`.
