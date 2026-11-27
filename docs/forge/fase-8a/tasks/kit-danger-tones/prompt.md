Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Zona pericolosa»), `PRODUCT.md` e `DESIGN.md`.

# Kit: il tono pericoloso di bottoni, bottoni-icona e menu

## Perché

Il proprietario vuole che le operazioni pericolose o irreversibili si riconoscano a colpo d'occhio, in rosso, in ogni interfaccia. Le zone in fondo alle pagine le fa `kit-danger-zone` (in parallelo). Qui i pezzi più piccoli, per le azioni che stanno su una riga o una scheda (eliminare un prestito, una voce della wishlist, una stanza): un bottone rosso pieno su ogni scheda sarebbe troppo forte.

Setup di Impeccable da `packages/ui` con `--target src/base/Button.tsx`; leggi `reference/craft-floor.md`.

## Cosa fare

1. **`Button` con `tone="danger"`** per le varianti `ghost` e `secondary`: testo e icona in `--bk-danger-strong`; `secondary` con il contorno `--bk-danger`; al passaggio e alla pressione fondo `--bk-danger-bg`; fuoco visibile come gli altri. La variante `danger` (piena) resta com'è. Senza `tone` nulla cambia.
2. **`IconButton` con `tone="danger"`**: icona in `--bk-danger-strong`, fondo `--bk-danger-bg` al passaggio. Il nome accessibile non cambia.
3. **`Menu`**: le voci con `danger: true` vanno sempre in fondo, dopo un divisore, nell'ordine in cui arrivano, anche se chi le passa le mette in mezzo. Lo stile rosso c'è già: controlla il contrasto nei due temi (testo ≥ 4,5:1, anche sulla voce evidenziata).
4. Contrasti: testo e icone rossi ≥ 4,5:1 sul fondo della superficie e sul fondo tinto, nei due temi (`tokens.contrast.test.ts` ha già gli strumenti per misurarlo: aggiungi le coppie nuove).

## Test

- `Button` `ghost` e `secondary` con `tone="danger"` hanno la classe del tono; senza, nulla cambia; `danger` pieno è com'era.
- `IconButton` con `tone="danger"` ha la classe del tono e lo stesso nome accessibile.
- `Menu` mette le voci pericolose in fondo dopo un divisore, nell'ordine in cui arrivano; senza voci pericolose nessun divisore in più.
- Le coppie di contrasto nuove passano nei due temi.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` e `npm test -w @bookeeper/ui` passano; `npm run typecheck -w @bookeeper/desktop` passa.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo `packages/ui/src/base/Button.tsx`, `Button.module.css`, `Button.test.tsx`, `IconButton.tsx`, `IconButton.module.css`, `IconButton.test.tsx`; `packages/ui/src/overlays/Menu.tsx`, `Menu.module.css`, `Menu.test.tsx`; `packages/ui/src/tokens.contrast.test.ts`.
