Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit` e il modulo che tocchi, con i test. Leggi `apps/desktop/src/modules/shelves/ShelvesPage.tsx`, `useShelvesView.ts` e `useWhere.ts` con i test.

# Scaffali: "Dov'è?" con una stanza vuota nel filtro

Difetto P3 dal run 5A1. Se il filtro per stanza nell'indirizzo indica una stanza senza mobili, "Dov'è?" non vince sul filtro: si vede lo stato vuoto della stanza, senza la riga della posizione.

Regola del run 5A1: con `book` nell'indirizzo, "Dov'è?" vince sempre. Il filtro per stanza si toglie e si apre il mobile del libro.

## Test

- `/shelves?room=<stanza senza mobili>&unit=<id>&book=<id>`: filtro tolto, mobile del libro aperto, riga "Dov'è?".
- I test esistenti di "Dov'è?" restano verdi.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- Cambiano solo file sotto `apps/desktop/src/modules/shelves/`.
