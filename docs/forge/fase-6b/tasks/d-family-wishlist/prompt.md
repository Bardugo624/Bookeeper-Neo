Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit` e il modulo che tocchi, con i test.

# Desktop: wishlist di famiglia

## Cosa fare

1. In cima alla pagina, la scelta "La mia" | "Famiglia" (indirizzo `?scope=family`). Un ospite vede solo "Famiglia", senza scelta e senza "Aggiungi".
2. "Famiglia": voci raggruppate per persona, con il nome come intestazione ("Tu" per sé, per primo). Le voci altrui non hanno comandi di modifica, eliminazione né conversione; le proprie restano come in "La mia".
3. Ricerca e ordinamento esistenti valgono anche in "Famiglia".

## Test

- Scelta e indirizzo; gruppi e ordine; comandi solo sulle proprie voci; ricerca in "Famiglia"; ospite.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- Cambiano solo: file sotto `apps/desktop/src/modules/wishlist/`, i file i18n `wishlist.json` (it e en).
