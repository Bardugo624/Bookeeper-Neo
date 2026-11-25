Leggi prima `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit`, il modulo che tocchi e i suoi test. La task `reading-ui` è già unita: parti dal suo lavoro nel modulo Libri.

# Tag

## Cosa fare

1. **Modulo `tags`** con ciò che il contratto elenca in "Punti di contatto".
2. **`TagChips`**: etichette col colore del tag (pallino o fondo tenue dai colori degli scaffali, testo sempre leggibile nei due temi). Nella scheda libro al posto delle etichette finte del mockup; in griglia non compaiono (troppo rumore), in lista una colonna "Tag".
3. **`TagPicker`** nel modulo del libro (crea e modifica) e, come azione rapida, nella scheda ("Modifica tag"): combobox a scelta multipla con ricerca; "Crea «testo»" quando non esiste, con scelta del colore; al più 20 tag (limite del core). Salva con `PUT /books/{id}/tags`.
4. **`ManageTagsDialog`** (dal menu "Altro" dell'elenco Libri, solo con permesso di scrittura): elenco con conteggio dei libri, rinomina, cambio colore, eliminazione con conferma che dice quanti libri lo perdono. Errore `tag_exists` accanto al campo.
5. **Assegnazione multipla**: nella barra di selezione dell'elenco, "Tag…" aggiunge o toglie un tag a tutti i selezionati (una richiesta per libro, in sequenza, con avanzamento e riepilogo; i fallimenti sono elencati).
6. Toccare un tag nella scheda porta a `/books?tag=<id>` (il filtro vero arriva con la task dei filtri: qui basta che l'elenco legga `tag` dall'indirizzo e lo mandi come `tag_id`).

Testi nello spazio dei nomi `tags`.

## Test

- `TagPicker`: ricerca, scelta multipla da tastiera, creazione al volo con colore, limite di 20.
- Scheda: etichette, "Modifica tag" salva l'insieme, clic → indirizzo con `tag`.
- Gestione: rinomina, doppione → messaggio, colore, eliminazione con conteggio.
- Assegnazione multipla: tre libri → tre richieste; uno fallisce → riepilogo.
- Contrasto: per ogni colore, il testo dell'etichetta usa un token di testo, non il colore del tag.
- Senza permesso di scrittura: solo lettura.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/tags/` e `apps/desktop/src/modules/books/`, i file i18n `tags.json` e `books.json`.
