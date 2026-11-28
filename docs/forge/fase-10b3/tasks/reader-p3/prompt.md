Leggi prima `docs/forge/fase-10b3/CONTRATTO.md`.

# Lettore: i P3 della 10B2 fuori dalla cornice

## File
`packages/reader/src/ui/view/Sheet.css`; `packages/reader/src/app/useDocumentTheme.ts` con il suo test; `packages/reader/src/ui/look/appearance.test.tsx`; `packages/reader/reader-e2e.json`; `.gitignore`.

## Cosa fare
- `Sheet.css`: togli la regola di sfondo e colore aggiunta in fondo. Ripete `Dialog.module.css` con le stesse variabili.
- `useDocumentTheme`: salva e rimetti anche la priorità (`getPropertyPriority`), così un valore `!important` che c'era prima torna `!important`.
- `appearance.test.tsx`: `other_sheets_still_open_at_70_percent` trova `Sheet.css` con `new URL('../view/Sheet.css', import.meta.url)`, non da `process.cwd()`. Così passa anche da `npx vitest run --root packages/reader` lanciato dalla radice.
- `packages/reader/reader-e2e.json` è l'uscita del test e2e, finita nel repository per sbaglio: toglilo, e `.gitignore` ignora `reader-e2e.json` ovunque.

## Test
- `restores_an_important_value_as_important`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- Dalla radice, `npx vitest run --root packages/reader src/ui/look` passa.
