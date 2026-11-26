Leggi prima `docs/forge/fase-8a1/CONTRATTO.md`.

# Kit: zona pericolosa, menu e bottone di chiusura sul telefono

1. **[P3]** `packages/ui/src/base/DangerZone.tsx` usa `styles.actions`, ma `DangerZone.module.css` non ha la regola `.actions`: il contenuto messo direttamente nella zona (non dentro una `DangerAction`) sta attaccato al contorno rosso, come il selettore del file del ripristino nelle impostazioni. Dai a `.actions` lo stesso respiro orizzontale e verticale delle righe `DangerAction`, e lo spazio tra i figli.
2. **[P3]** `packages/ui/src/overlays/Menu.tsx`: se tutte le voci sono pericolose, il divisore compare in cima al menu senza nulla sopra. Senza voci normali, nessun divisore.
3. **[P3]** `Menu.tsx`: una voce pericolosa tra due separatori lascia due divisori di fila (esempio: `[Modifica, sep, Elimina(danger), sep, Condividi]` diventa `Modifica, sep, sep, Condividi, divisore, Elimina`). Separatori doppi, in testa o in coda alle voci normali si riducono a nessuno o a uno.
4. **[Nota del revisore di `danger-mobile`]** Sul telefono il bottone di chiusura dei dialoghi (`Dialog`, la `X` in alto) è 26×26 px, sotto i 44 px richiesti per il tocco. Con un puntatore grossolano (`@media (pointer: coarse)`) il bersaglio del bottone diventa almeno 44×44 px, senza cambiare l'aspetto sul desktop.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` e `npm test -w @bookeeper/ui` passano.
- Ogni punto ha un test (struttura, ordine dei figli del menu, regole CSS lette dal foglio).
- Cambiano solo `packages/ui/src/base/DangerZone.module.css`, `DangerZone.tsx`, `DangerZone.test.tsx`, `packages/ui/src/overlays/Menu.tsx`, `Menu.test.tsx`, `Dialog.module.css`, `Dialog.test.tsx`.
