Leggi prima `docs/forge/fase-2c/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Leggi `apps/desktop/src/kit` e un modulo esistente (`loans`) per struttura, hook e test. Le task `desktop-files` e `p3-2b1` sono già unite.

# Etichette PDF

Leggi `packages/api/src/resources/labels.ts`, `crates/bookeeper-core/src/api/labels.rs` e `crates/bookeeper-core/src/labels.rs` (campi di `LabelsRequest`, formati, limiti, intestazione `x-labels-skipped`), e come la 0.3 offriva le etichette.

## Cosa fare

1. **Modulo `labels`** senza voce di navigazione: esporta da `index.ts` `LabelsDialog` (`{ bookIds: string[]; open; onClose }`).
2. **Dialog**: riepilogo "N libri"; opzioni vere del core (formato del foglio o dell'etichetta, cosa stampare, posizione di partenza sul foglio se esiste); anteprima schematica della griglia del foglio con le caselle che verranno usate (solo forme, niente PDF nella pagina). "Crea il PDF" chiama il core con `requestRaw`, salva con `saveFile` (`etichette-<aaaa-mm-gg>.pdf`). Se il core dice che alcuni libri sono stati saltati (`x-labels-skipped`), il toast lo dice col numero. Oltre il limite di libri per richiesta: messaggio prima dell'invio.
3. **Aggancio in Libri**: nella barra di selezione multipla del modulo `books` un bottone "Etichette" accanto a "Elimina"; nel menu "Altro" della scheda libro la voce "Etichetta". Sono le uniche modifiche al modulo `books`.

Testi nello spazio dei nomi `labels`.

## Test

- Dialog: opzioni mandate nel corpo; `saveFile` con PDF; saltati → toast col numero; limite superato → nessuna richiesta.
- Anteprima: numero di caselle evidenziate uguale ai libri, a partire dalla posizione scelta.
- Libri: il bottone compare in selezione e apre il dialog con gli id selezionati; voce nel menu della scheda.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/labels/` e `apps/desktop/src/modules/books/`, `packages/i18n/src/locales/it/labels.json`, `packages/i18n/src/locales/en/labels.json`.
