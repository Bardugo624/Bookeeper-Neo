Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e i contratti della fase 1 che riguardano i file che tocchi. Ogni correzione ha un test che fallisce prima e passa dopo.

# UI: azione nel toast e commento di ShelfUnit

1. **Azione nel toast** (`packages/ui/src/overlays/Toast.tsx`): `useToast().show` accetta `action?: { label: string; onClick: () => void }`. Il bottone dell'azione sta nel toast, è raggiungibile da tastiera, e il clic chiude il toast dopo aver chiamato il gestore. La chiusura automatica resta sospesa al passaggio e al fuoco, anche quando il fuoco è sul bottone dell'azione. Con un'azione presente la durata è 8 secondi invece di 5.
2. **Commento fuori posto** (`packages/ui/src/shelf/ShelfUnit.tsx:21`): il commento di `readOnly` è finito tra il commento di `dropTarget` e il suo campo. Ogni proprietà ha il proprio commento, uno solo, subito sopra.

## Test

In `Toast.test.tsx`: l'azione è un bottone con quel nome; il clic chiama il gestore una volta e chiude; con timer finti un toast con azione dura 8 secondi; col fuoco sul bottone dell'azione non si chiude; senza azione il comportamento di oggi non cambia.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` e `npm test -w @bookeeper/ui` passano.
- Cambiano solo: `packages/ui/src/overlays/Toast.tsx`, `Toast.module.css`, `Toast.test.tsx`, `packages/ui/src/shelf/ShelfUnit.tsx`.
