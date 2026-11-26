Leggi prima `docs/forge/fase-5a/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`. La task `d-where` è già unita: parti dal suo codice. Leggi `apps/desktop/src/modules/shelves` per intero, con i test e `dnd.ts`.

# Desktop: spostare tra mobili e larghezza del dorso

## Cosa fare

1. **Trascinare su un altro mobile**: durante un trascinamento (dal vassoio o da un ripiano) le linguette dei mobili sono bersagli. Fermarsi mezzo secondo su una linguetta apre quel mobile, così si rilascia sul ripiano voluto. Rilasciare sulla linguetta stessa colloca il libro nel primo ripiano con un posto libero (`PUT …/placement` senza `slot_index`, ripiano per ripiano finché uno non risponde `row_full`; se tutti sono pieni, messaggio "Il mobile è pieno").
2. **Da tastiera**: il menu del dorso (`SpineMenu`) offre "Sposta in…", che apre il dialog di collocazione già esistente (`PlaceDialog`) con mobile e ripiano attuali preselezionati. Vale per i libri già collocati come "Colloca in…" vale per gli altri.
3. **Larghezza del dorso**: il menu del dorso offre "Larghezza del dorso" con quattro scelte a radio: "Dalle pagine" (nessun valore), "Sottile" (1), "Medio" (2), "Largo" (3). Scrive `spine_width` con `PUT …/placement` mantenendo la posizione. Il mobile disegna la larghezza scelta; "Dalle pagine" torna al calcolo dal numero di pagine. Guarda come `ShelfCabinet` passa oggi le pagine al dorso e mappa 1, 2, 3 su tre larghezze dentro i limiti di `spineWidth`.
4. Scritture ottimistiche con ripristino in caso d'errore; `slot_taken` e `row_full` hanno un messaggio proprio; dopo ogni scrittura si invalidano mobili, libri del mobile, vassoio, elenco e dettaglio dei libri.
5. Chi non può modificare non vede né bersagli né voci di menu di scrittura.

## Test

- Sosta sulla linguetta: apre il mobile dopo il ritardo (orologio finto), non prima.
- Rilascio sulla linguetta: primo ripiano libero; secondo ripiano se il primo è pieno; "Il mobile è pieno".
- "Sposta in…": preselezione, spostamento su un altro mobile.
- Larghezza: ogni scelta manda il valore giusto e mantiene la posizione; errore con ripristino.
- Sola lettura: niente bersagli, niente voci.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Nessun componente supera 250 righe. Nessun testo scritto nei componenti.
- Cambiano solo: file sotto `apps/desktop/src/modules/shelves/`, i file i18n `shelves.json` (it e en).
