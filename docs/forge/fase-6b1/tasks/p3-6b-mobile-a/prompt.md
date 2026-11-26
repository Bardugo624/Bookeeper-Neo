Leggi prima `docs/forge/fase-6b1/CONTRATTO.md`, `docs/forge/fase-6b/CONTRATTO.md` e `docs/forge/fase-6a/CONTRATTO.md`. Leggi ogni file citato e i suoi test prima di cambiarlo. La task `ui-icons` è già unita. Leggi `apps/mobile/src/modules/search` (in particolare `routes.tsx`, `BookDetailPage.tsx`, `BookEditPage.tsx` e la frase di "Dove si trova"), `apps/mobile/src/modules/shelves`, `apps/mobile/src/modules/loans` e `apps/mobile/src/modules/scan/OwnedBody.tsx`.

# PWA: navigazione, prestiti, frase della posizione

1. **Storia dopo il salvataggio** (`search/BookEditPage.tsx`, circa riga 24): dopo "Salva" la scheda compare due volte nella storia, e il gesto indietro riapre la stessa scheda. Regola: il salvataggio torna alla scheda sostituendo la voce della pagina di modifica, così indietro porta dove si era prima della scheda.
2. **Scheda attiva sugli scaffali** (`search/routes.tsx`, circa riga 15): su `/shelves` e `/shelves/:id` nessuna scheda della barra è evidenziata. Regola: "Cerca" resta evidenziata, come per `/search` e `/books`.
3. **Indietro dagli scaffali** (`search/BookDetailPage.tsx`, circa riga 123): aprendo un libro da un dorso su `/shelves/:id`, indietro porta a `/search` invece che al mobile; e indietro da un mobile porta sempre a `/shelves` anche se ci si è arrivati dalla scheda di un libro. Regola: indietro torna alla pagina da cui si è arrivati; solo se si è entrati direttamente (nessuna pagina precedente dell'app) si usa la pagina di ripiego di oggi.
4. **Scadenza oggi di sera** (`loans/loanModel.ts`, circa riga 84): una scadenza "oggi" si invia alle 23:00 ora locale; dopo le 23 il server la rifiuta perché precede l'inizio del prestito. Regola: la scadenza è la fine del giorno scelto, 23:59:59 ora locale.
5. **Icona della persona** (`loans/BorrowerChoice.tsx`, `loans/LoanRow.tsx`): una persona della libreria ha l'icona degli scaffali. Regola: icona `user`.
6. **Frase della posizione nella scansione** (`scan/OwnedBody.tsx`): "Si trova in: Libreria grande, ripiano 1" non dice il posto. Regola: la stessa frase del blocco "Dove si trova" ("Libreria grande · ripiano 1 · posto 2"), dalla stessa funzione; se non è esportata dal modulo `search`, esportala da `apps/mobile/src/modules/search/index.ts`.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Bersagli tattili di almeno 44×44px; nessuno scorrimento orizzontale a 320px.
- Cambiano solo: file sotto `apps/mobile/src/modules/search/`, `apps/mobile/src/modules/shelves/`, `apps/mobile/src/modules/loans/`, file sotto `apps/mobile/src/modules/scan/` (solo per il punto 6), i file i18n `msearch.json`, `mshelves.json`, `mloans.json` e `mscan.json` (it e en).
