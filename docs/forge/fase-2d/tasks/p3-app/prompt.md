Leggi prima `docs/forge/fase-2d/CONTRATTO.md` e i contratti che cita: regole, nomi e aspetto valgono anche qui. Ogni correzione ha un test che fallisce prima e passa dopo.

# App: dieci difetti P3 e tre ritocchi visti a schermo

## Difetti del revisore

1. **`modules/books/BookDrawer.tsx:46`** — il toast mostra la chiave grezza `books.toast.colorFailed`: manca nelle due lingue. Aggiungila. Aggiungi anche un test in `apps/desktop` che raccoglie ogni chiave letterale passata a `t(...)` nei sorgenti dell'app e fallisce se una non esiste in italiano.
2. **`packages/i18n/src/locales/it/settings.json:90`** (e inglese) — in Informazioni il testo "telefono non pronto" è copiato da Dispositivi e dice "qui comparirà il bottone per aggiungere un telefono". Regola: testo proprio, che rimanda a Dispositivi.
3. **`apps/desktop/src/app/i18n.tsx:51`** — con "Sistema" la lingua si legge solo al primo disegno. Regola: ascolta l'evento `languagechange` e aggiorna.
4. **`modules/settings/sections/transfer/useImport.ts:38`** — il controllo di dimensione guarda il file grezzo, ma il limite del server vale sul corpo JSON, che è più grande. Regola: si misura il corpo che verrà inviato.
5. **`useImport.ts:33`** — se il file non si può leggere compare il messaggio generico; la chiave `transfer.import.unreadable` non è mai usata. Usala.
6. **`modules/labels/useLabelsPdf.ts:45`** — un errore vecchio resta a schermo riaprendo il dialog. Regola: aprire il dialog azzera lo stato.
7. **`modules/labels/SheetPreview.module.css:15`** — `--bk-accent` non esiste: le caselle usano sempre `#3b6ea5`, fuori tavolozza. Regola: token esistente, nessun colore scritto. Aggiungi ai moduli dell'app un test di stile come quello di `packages/ui` (`styleCheck`), se `@bookeeper/ui` lo esporta; altrimenti un controllo equivalente locale, su tutti i `.module.css` di `apps/desktop/src`. Correggi ciò che trova.
8. **`modules/books/BooksPage.tsx:139`** — il primo libro salvato con "Salva e aggiungi un altro" non riceve la celebrazione. Regola: la celebrazione compare alla chiusura del pannello se in quella sessione del pannello il totale è passato da 0 a 1 o più; mostra il primo libro creato.
9. **`modules/onboarding/onboarding.test.tsx:84`** — la parte "altra connessione" del test non cambia connessione. Riscrivila con due connessioni vere.
10. **Riordino di un ripiano e copertine**: nessuna azione qui; sono già corretti.

## Ritocchi visti provando l'app

11. **Scelta del file**: import, ripristino e caricamento della copertina mostrano il controllo nativo del browser, in inglese ("Choose File"). Aggiungi a `apps/desktop/src/kit` un `FilePicker` (bottone secondario con testo tradotto, nome del file scelto accanto, `accept`, trascinamento facoltativo, input nativo nascosto ma raggiungibile da tastiera e con etichetta) e usalo nei tre punti.
12. **Icone delle sezioni delle impostazioni**: Libreria e "Import ed export" hanno la stessa icona; Account usa un segnaposto di mappa. Regola: un'icona diversa e pertinente per sezione, tra quelle di `IconName`; se ne manca una adatta, scegli la più vicina e dichiaralo.
13. **Backup programmato**: i due campi e il bottone "Salva" non sono allineati (etichette su righe diverse, bottone a metà). Regola: etichette sulla stessa riga, campi alla stessa altezza, testo d'aiuto sotto, bottone allineato ai campi.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop`, `npm test -w @bookeeper/i18n`, `npm run build -w @bookeeper/desktop` passano.
- Nessun componente supera 250 righe.
- Cambiano solo: `apps/desktop/src/app/i18n.tsx`, `apps/desktop/src/app/i18n.test.tsx`, file sotto `apps/desktop/src/kit/`, `apps/desktop/src/modules/{settings,labels,books,onboarding}/`, `packages/i18n/src/locales/`.
