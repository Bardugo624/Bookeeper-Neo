Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Il tour»), `docs/forge/fase-8a/request.md`, `PRODUCT.md` e `DESIGN.md`. Sono già unite: `tour-core` (il motore in `apps/desktop/src/modules/tour/`: `TourProvider`, `useTour`, ancore, segnali, riflettore, scheda, `FirstStepsPill`, flag «persona nuova»), `book-dialog` (il pop-up `BookDialog`) e `book-cover-flight` (la copertina che vola nella griglia).

# Desktop: il tour parte, e il primo libro

## Cosa

Il percorso `firstBook` del tour «Primo libro dal vivo»: questa task lo fa partire per le persone nuove e ne scrive il **passo 1**. I passi 2 (il mobile) e 3 (il telefono) arrivano con `tour-place-pair`: scrivi il percorso in modo che si aggiungano in coda senza toccare il passo 1.

Setup di Impeccable da `apps/desktop` con `--target src/modules/tour`; leggi `reference/onboard.md`, `reference/overdrive.md` e `reference/craft-floor.md`.

## Chi lo vede, e quando parte

1. Subito dopo il successo di tre percorsi di benvenuto, il modulo `welcome` segna la connessione nuova come «persona nuova» (con la funzione di `tour-core`): «Crea qui», «Crea su un server», «Unisciti» con un invito. NON con «Unisciti» tramite codice di abbinamento o email e password: è una persona che esiste già. I punti giusti: subito dopo `authenticate` in `useCreateLocal.ts` (`create`, non il ramo che apre una libreria già presente), in `useCreateOnServer.ts` e in `useJoin.ts` `join` (invito con nome). NON in `useJoin.ts` `login` (email e password) né nel ramo di `submit` che riscatta il codice di un dispositivo.
2. Entrando nell'app con quel segno, il tour sceglie il percorso e cancella il segno: `firstBook` se la persona può scrivere (`usePermission().can('write')`) e la libreria non ha libri; negli altri casi lascia il segno com'è (il percorso `explore` arriva con `tour-explore`).
3. Monta `FirstStepsPill` nella barra laterale, nella zona in basso (sopra la scheda della persona), e metti le ancore sulle voci della barra: `nav.books`, `nav.shelves`, `nav.devices`. La barra è `apps/desktop/src/shell/Sidebar.tsx`: lì, in modo generico, metti l'ancora `nav.<id>` su ogni voce e `nav.search` su «Cerca e comandi», e uno spazio per «Primi passi» tra la navigazione e la scheda della persona (`LibraryBadge`). È l'unica modifica alla cornice: tienila minima.

## Passo 1: «Aggiungi un libro che hai vicino»

- Fuori dai Libri il riflettore è su `nav.books` e la scheda dice di andarci.
- Nei Libri vuoti è su «Aggiungi il primo libro» dello stato vuoto (ancora `books.addFirst`); se la libreria ha già libri ma il percorso è partito, su «Aggiungi» dell'intestazione (`books.add`).
- Con il pop-up aperto, al momento ISBN, il riflettore scivola sul campo ISBN (`book.isbn`): la scheda spiega dove si trova l'ISBN (sul retro, sopra il codice a barre) e che si può anche «Inserisci a mano». Al momento della scheda, il riflettore va su «Salva» (`book.save`): «Controlla i dati e salva».
- Si completa con il segnale `book-created` (lo manda la pagina dei Libri quando un libro nuovo è salvato). Il volo della copertina parte come sempre; quando atterra, la scheda del tour mostra «{title} è il primo libro della tua libreria» e il passo successivo.
- Con il tour in corso, la festa del primo libro di oggi NON si apre: il tour ne prende il posto. Oggi `BooksPage.tsx` la chiama con `firstBook.celebrate(first)` in `closeAdd` (hook `useFirstBook`, modulo `onboarding`). Senza tour resta com'è.
- Il segnale `book-created` parte da `onCreated` in `BooksPage.tsx`.

## Testi

Nel namespace `tour` (italiano e inglese): titolo e testo del passo 1 nei suoi tre momenti, la frase del primo libro. Frasi brevi, seconda persona singolare.

## Test

- I tre benvenuti giusti segnano la persona nuova; abbinamento con codice ed email e password no.
- Persona nuova che può scrivere, libreria vuota: il tour parte con `firstBook` e il segno sparisce; ospite o libreria con libri: non parte e il segno resta.
- Il riflettore segue il passo 1: voce Libri, «Aggiungi il primo libro», campo ISBN a pop-up aperto, «Salva» nella scheda.
- `book-created` completa il passo; la festa del primo libro non si apre con il tour in corso e si apre senza.
- «Primi passi» compare nella barra quando il tour è in pausa e lo riprende.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/kit/styles.test.ts` (da `apps/desktop`) passa: i fogli di stile usano solo token esistenti; `npx vitest run src/modules/tour src/modules/welcome src/modules/books src/modules/onboarding src/shell` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/tour/`, `welcome/`, `books/`, `onboarding/`, `apps/desktop/src/shell/Sidebar.tsx` (con il suo CSS e il suo test) e `tour.json` (it, en).
