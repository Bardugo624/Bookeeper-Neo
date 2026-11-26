Leggi prima `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit`, il modulo che tocchi e i suoi test.

# Stato di lettura nei Libri

## Cosa fare

1. **Modulo `reading`** con ciò che il contratto elenca in "Punti di contatto", più gli hook (`useReading`, `useSetReading`, `useClearReading`).
2. **`ReadingCard`** nella colonna destra della scheda libro, come nel mockup "04": `ProgressRing` da 60px con la percentuale (pagina corrente su pagine totali; senza pagine totali l'anello mostra lo stato senza percentuale), etichetta di stato, "Pagina N di M", data d'inizio. Azioni: cambia stato (menu con i quattro stati e "Togli dallo stato"), "Aggiorna la pagina" (campo numerico con più e meno, Invio salva), valutazione a cinque stelle (gruppo di opzioni navigabile con le frecce, azzerabile), nota (area di testo che si salva all'uscita dal campo, con contatore oltre 1.800 caratteri). Senza stato: invito "Lo stai leggendo?" con i bottoni "Da leggere" e "Inizia a leggere".
3. **Bottone "Segna come letto"** sotto la copertina della scheda (mockup): con stato `reading` o `to_read` porta a `read`; con `read` diventa "Letto il <data>" e non è un bottone.
4. **Griglia e lista**: `ReadingRing` da 30px in basso a destra sulla copertina dei libri `reading`; un segno discreto per `read`; in lista una colonna "Lettura".
5. **Filtri rapidi**: le pillole dell'elenco diventano Tutti, Da leggere, In lettura, Letti, In prestito, Non collocati (mockup "02"), con `reading` nell'indirizzo.
6. Errori di convalida del core (pagina oltre il totale, date) mostrati accanto al campo. Le scritture sono ottimistiche con ripristino in caso d'errore.

Testi nello spazio dei nomi `reading`.

## Test

- Scheda senza stato → invito; "Inizia a leggere" manda `status: reading`.
- Anello: 312 di 503 → 62%; senza pagine totali nessuna percentuale; `read` → pieno.
- Aggiornamento della pagina con più, meno e Invio; oltre il totale → errore dal core accanto al campo e ripristino.
- Stelle da tastiera; azzeramento.
- Nota salvata all'uscita dal campo, una sola richiesta; contatore.
- "Segna come letto" → `read`; poi testo con la data.
- "Togli dallo stato" → `DELETE`.
- Griglia: anello solo sui libri in lettura; filtro "In lettura" manda `reading=reading` ed è nell'indirizzo.
- Un membro senza permesso di scrittura sui libri può comunque cambiare il proprio stato.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/reading/` e `apps/desktop/src/modules/books/`, i file i18n `reading.json` e `books.json`.
