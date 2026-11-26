Leggi prima `docs/forge/fase-7a/CONTRATTO.md`. Leggi `apps/mobile/src/modules/search` (`ResultList.tsx`, `useBookSearch.ts`) con i test.

# PWA: liste lunghe

Con 10.000 libri, scorrendo a lungo l'elenco della ricerca il telefono tiene migliaia di righe nel DOM.

## Cosa fare

1. **Rendering a finestra** dell'elenco della ricerca: nel DOM solo le righe visibili più un margine; l'altezza totale è quella delle righe caricate; lo scorrimento resta quello della pagina. Nessuna libreria.
2. Tornando dalla scheda di un libro, l'elenco riprende dalla stessa posizione, come oggi.
3. Il caricamento della pagina successiva parte ancora vicino al fondo.

## Test

- Con 2.000 righe finte: nel DOM al più 80 righe, qualunque sia la posizione.
- Scorrimento simulato; ritorno dalla scheda alla stessa posizione; pagina successiva.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/ui` passa.
- Cambiano solo file sotto `apps/mobile/src/modules/search/`.
