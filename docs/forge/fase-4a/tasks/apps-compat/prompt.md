Leggi prima `docs/forge/fase-4a/CONTRATTO.md`. Tutte le altre task del run 4A sono già unite.

# App: dati di prova allineati ai tipi nuovi

Il client rigenerato ha campi nuovi obbligatori nelle risposte (`BookOut.tags`, `BookOut.reading`, `ShelfOut.room`, e gli altri che lo schema segna come obbligatori). La verifica del run fallisce su `npm run typecheck`: i dati di prova di `apps/desktop` e `apps/mobile` non li hanno.

## Cosa fare

1. Esegui `npm run typecheck` dalla radice ed elenca gli errori.
2. Correggi **solo** dati di prova, costruttori di oggetti finti e file di test (`testkit.tsx`, `*.test.tsx`, `fixtures.ts`, `testing.ts`): i campi nuovi prendono il valore neutro (`tags: []`, `reading: null`, `room: null`). Dove più file costruiscono lo stesso oggetto finto, non duplicare: se nel modulo esiste già un costruttore, usalo.
3. Se un errore sta in codice dell'app che non è di prova (un componente o un hook che costruisce un `BookOut`), correggilo con il minimo indispensabile e dichiaralo nel rapporto.
4. Nessuna funzione nuova nell'interfaccia: le viste per tag, lettura e stanze arrivano nei run 4B e 4C.

## Acceptance criteria

- `npm run typecheck` e `npm test` dalla radice passano.
- `npm run build -w @bookeeper/desktop -w @bookeeper/mobile` passa.
- Cambiano solo file sotto `apps/desktop/src/` e `apps/mobile/src/`.
