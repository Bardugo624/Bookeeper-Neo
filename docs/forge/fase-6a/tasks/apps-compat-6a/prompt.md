Leggi prima `docs/forge/fase-6a/CONTRATTO.md`. La task `client-6a` è già unita.

# App: compatibilità con i tipi del run 6A

I tipi rigenerati possono rendere obbligatori campi nuovi nelle risposte (`BookOut.owner`, `LoanOut.borrower`, `WishOut.user` e altri). Le app non usano ancora le funzioni nuove: arriveranno nei run 6B e 6C.

## Cosa fare

1. Esegui `npm run typecheck` e `npm test` di `@bookeeper/desktop` e `@bookeeper/mobile`.
2. Correggi solo ciò che i tipi nuovi rompono: dati di prova nei test e nei `testkit`, finti server, costruttori di oggetti di prova. Valori neutri (`owner: null`, `borrower: null`, `user` con la persona di prova).
3. Nessun cambio di comportamento, nessuna funzione nuova, nessun testo nuovo. Se un errore richiede di cambiare il codice dell'app e non solo i dati di prova, fermati e dillo.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm run typecheck -w @bookeeper/mobile` e `npm test -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/ui` passa.
- Cambiano solo file sotto `apps/desktop/src/` e `apps/mobile/src/`, e solo file di test, `testkit` e dati di prova. Elencali nel rapporto.
