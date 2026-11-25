Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e i contratti della fase 1 che riguardano i file che tocchi. Ogni correzione ha un test che fallisce prima e passa dopo. Le task `core-b1` e `ui-b1` sono già unite: `PlaceIn` ha `shift`, `CreateBook` e `PatchBook` hanno `cover_color`.

# Scaffali e libri: cinque difetti

1. **Scaffali, riordino non atomico** (`modules/shelves/usePlacement.ts:66`): il riordino in un ripiano pieno usa `DELETE` e più `PUT`; un fallimento a metà lascia il libro fuori dallo scaffale. Regola: ogni inserimento e spostamento usa una sola chiamata `PUT /books/{id}/placement` con `shift: true`. Spariscono il "parcheggio" in un altro ripiano, `freeSlotElsewhere` e la sequenza di spostamenti lato client. `row_full` (409) → messaggio "Il ripiano è pieno." e ripristino dell'ordine mostrato. L'aggiornamento ottimistico resta.
2. **Libri, colore del segnaposto** (`modules/books/CoverPicker.tsx:22`): senza copertina non si può scegliere il colore. Regola: campioni con le tinte `clothTone` più "Automatico" (nessun colore: `null`); la scelta va in `cover_color` alla creazione e alla modifica; l'anteprima usa il colore scelto. Ogni campione ha nome accessibile; gruppo a scelta singola navigabile con le frecce.
3. **Libri, doppione di ISBN** (`modules/books/useIsbnLookup.ts:21`): l'avviso copre solo la corrispondenza esatta. Regola: un ISBN-10 e il suo ISBN-13 (prefisso 978) sono lo stesso libro: la ricerca del doppione prova entrambe le forme; vale anche per un ISBN scritto nel modulo dopo "Inserisci a mano" (al termine della digitazione, con ritardo). Conversione tra le due forme in una funzione pura.
4. **Libri, `DELETE` inutile** (`modules/books/useBookWrites.ts:43`): su un libro nuovo, scegliere una copertina e poi "Rimuovi" manda una `DELETE` della copertina dopo la creazione. Regola: per un libro nuovo non parte nessuna `DELETE`; per un libro esistente parte solo se una copertina esisteva.
5. **Libri, `Ctrl A` oltre 500** (`modules/books/BooksPage.tsx:28`): il core rifiuta più di 500 id per eliminazione multipla. Regola: l'eliminazione multipla invia a blocchi di al più 500 id, in sequenza, e somma i risultati in un solo toast; se un blocco fallisce si ferma e dice quanti sono stati eliminati. La conferma dice il numero totale.

## Test

- Scaffali: inserimento, spostamento nello stesso ripiano pieno e tra ripiani → una sola richiesta con `shift: true`; `row_full` → messaggio e ripristino; nessuna `DELETE` in nessun riordino. I test esistenti che descrivono il "parcheggio" si riscrivono.
- Colore: scelta di un campione → `cover_color` nel corpo; "Automatico" → `null` in modifica, campo assente in creazione; frecce da tastiera.
- ISBN: conversione 10↔13 con cifre di controllo (inclusa `X`); ISBN-13 con prefisso 979 non ha forma a 10; doppione trovato cercando l'altra forma; doppione da ISBN scritto a mano.
- Copertina: libro nuovo con copertina scelta e poi rimossa → nessuna `DELETE`.
- Eliminazione multipla: 1.200 id → tre richieste da 500, 500, 200; fallimento al secondo blocco → toast con 500 eliminati.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano; `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- `grep -rn "freeSlotElsewhere" apps/desktop/src` non trova nulla.
- Cambiano solo: file sotto `apps/desktop/src/modules/shelves/` e `apps/desktop/src/modules/books/`, e i file i18n `books.json` e `shelves.json` nelle due lingue.
