Leggi prima `docs/forge/fase-8a1/CONTRATTO.md` e `docs/forge/fase-8a/CONTRATTO.md` (sezione «Il tour»). Il tour è in `apps/desktop/src/modules/tour/`.

# Tour: la scheda non copre i comandi, e tre rilievi

1. **[P2, visto nel browser]** Con «Nuovo libro» aperto, al passo «Dov'è l'ISBN» la scheda del tour si apre sotto il campo ISBN, dentro il pop-up, e **copre «Cerca» e «Inserisci a mano»**: proprio i comandi che il passo chiede di usare, che non si possono più cliccare. La scheda NON DEVE mai coprire un elemento interattivo del dialogo in cui sta l'ancora. Quando l'ancora è in un dialogo, mettila accanto al pannello del dialogo (fuori dal suo riquadro, a destra o a sinistra dove c'è spazio, allineata all'ancora), restando nel DOM del dialogo come oggi, così un clic sulla scheda non lo chiude. Se ai lati non c'è spazio (finestra stretta), sopra o sotto il pannello. Test: con il riquadro del dialogo e dell'ancora simulati, la scheda non si sovrappone al pannello e resta cliccabile; con la finestra stretta va sopra o sotto.
2. **[P3]** `apps/desktop/src/modules/books/BooksPage.tsx`: la frase «{title} è il primo libro della tua libreria» compare anche se la libreria aveva già libri. Deve comparire solo quando quel libro è davvero il primo.
3. **[P3]** `BooksPage.tsx`: la festa del primo libro può ancora aprirsi dopo, quando il tour ha già segnato il primo libro. Quando il tour se ne occupa, la festa si segna come vista.
4. **[P3]** `apps/desktop/src/modules/tour/store.ts`: cambiando libreria la nota del tour resta. Lo stato del tour va azzerato al cambio di connessione e riletto per quella nuova.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/tour src/modules/books/BooksTour.test.tsx src/kit/styles.test.ts` (da `apps/desktop`) passa.
- Ogni punto ha un test.
- Cambiano solo `apps/desktop/src/modules/tour/`, `apps/desktop/src/modules/books/BooksPage.tsx`, `apps/desktop/src/modules/books/BooksTour.test.tsx`.
