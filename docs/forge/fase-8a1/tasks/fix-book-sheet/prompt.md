Leggi prima `docs/forge/fase-8a1/CONTRATTO.md`. Il pop-up «Nuovo libro» / «Modifica libro» è `apps/desktop/src/modules/books/BookSheet.tsx` con `CoverPicker.tsx`, `BookFormFields.tsx`, `BookSheet.module.css` e `BookForm.module.css`.

# Pop-up del libro: la colonna della copertina, e un rilievo

1. **[P2, visto nel browser]** In «Modifica libro» (scheda larga), il bottone «Carica un'immagine» della colonna della copertina **esce dalla colonna e copre il campo Titolo**: del titolo si legge «nome della rosa» al posto di «Il nome della rosa». La colonna è troppo stretta per la copertina e i suoi comandi affiancati. Nella scheda larga i comandi della copertina (carica, rimuovi, colori, proposte) vanno **sotto** la copertina, a tutta larghezza della colonna, senza mai uscire dalla colonna; il testo «Nessun file scelto» del selettore non deve allargare la colonna. Controlla anche «Nuovo libro» dopo «Inserisci a mano» e sotto i 640 px. Test: la struttura della colonna mette i comandi dopo la copertina; un test di stile (o un controllo sul CSS) assicura che i comandi non siano affiancati alla copertina nella scheda larga.
2. **[P3]** `BookSheet.tsx`: togliere l'errore di un campo riapre un altro gruppo chiuso che ha ancora un errore e sposta il fuoco lì mentre la persona sta scrivendo. Il gruppo si apre e il fuoco si sposta solo all'invio («Salva»), non quando un errore sparisce.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/books src/kit/styles.test.ts` (da `apps/desktop`) passa.
- Cambiano solo `apps/desktop/src/modules/books/BookSheet.tsx`, `BookSheet.module.css`, `BookForm.module.css`, `CoverPicker.tsx`, `CoverPicker.test.tsx`, `AddBook.test.tsx`, `BookCover.test.tsx` e un test nuovo accanto al pop-up se serve.
