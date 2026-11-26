Leggi prima `docs/forge/fase-8a/CONTRATTO.md`, `docs/forge/fase-8a/request.md`, `PRODUCT.md` e `DESIGN.md`. La task `kit-dialog-grow` è già unita: il `Dialog` del kit ha `size` (`default` | `wide`), cresce con il contenuto e con `origin` nasce dal pulsante che l'ha aperto.

# Desktop: «Nuovo libro» diventa un pop-up che cresce

## Il problema

Oggi «Nuovo libro» e «Modifica libro» sono un pannello laterale alto quanto la finestra (`apps/desktop/src/modules/books/BookDrawer.tsx`). Al primo passo contiene solo il campo ISBN e due bottoni: il resto è vuoto. Il proprietario vuole un **pop-up al centro dello schermo, che si allarga man mano che si compila**. «Modifica libro» usa lo stesso pop-up, che si apre già grande.

## Cosa fare

Setup di Impeccable da `apps/desktop` con `--target src/modules/books/BookDrawer.tsx`; leggi `reference/layout.md`, `reference/animate.md` e `reference/craft-floor.md`. È rifinitura: campi, testi, validazioni, salvataggio, «Salva e aggiungi un altro», avvisi di ricerca e di duplicato, copertina e tag restano come sono.

1. **Contenitore.** `BookDrawer` diventa `BookDialog` (file, componente ed export di `books/index.ts`) e usa il `Dialog` del kit al posto del `Drawer`. Aggiorna chi lo importa: `BooksPage.tsx` (Nuovo libro) e `DetailToolbar.tsx` (Modifica libro). La palette e il tasto `n` aprono `/books?new=1`, che `BooksPage` gestisce con `useNewBookParam`: quel percorso resta com'è. Aggiorna `writeKit.ts` (`openNewBook`) e i test che cercano il pannello: in `books` `AddBook`, `ActiveFilters`, `BookTags`, `BookActions`, `BookCover`; e `modules/onboarding/onboarding.test.tsx`. «Aggiungi il primo libro» sta in `modules/onboarding/FirstBookHint.tsx`: passa il suo bottone come `origin`.
2. **Tre momenti, un pop-up che cresce.**
   - **ISBN** (`size="default"`): titolo «Nuovo libro», campo ISBN con il suo suggerimento, «Cerca» e «Inserisci a mano». Il pop-up abbraccia il contenuto: niente spazio vuoto.
   - **Scheda** (`size="wide"`), dopo la ricerca o con «Inserisci a mano»: il pop-up si allarga e mostra il libro come una scheda. A sinistra la copertina (con la sua scelta); a destra gli essenziali (titolo, sottotitolo, autori, editore, anno), con sopra l'avviso della ricerca o del duplicato. Sotto, i tag. I gruppi «Edizione», «Raccolta» e «Note» diventano righe che si aprono: chiusi se vuoti, aperti se la ricerca li ha riempiti. Aprirne uno allarga ancora il pop-up. In fondo le azioni di oggi (Annulla, Salva e aggiungi un altro, Salva).
   - **Modifica**: si apre direttamente nella scheda (`wide`), con aperti i gruppi che hanno dei valori.
   «Salva e aggiungi un altro» riporta al momento ISBN: il pop-up torna piccolo.
3. **Nasce dal pulsante.** Chi apre il pop-up passa il proprio bottone come `origin`: «Aggiungi» nell'intestazione dei Libri, «Aggiungi il primo libro» nello stato vuoto, «Modifica» nella scheda del libro. Dalla palette dei comandi si apre senza `origin`.
4. **Finestre strette.** Sotto i 640 px di larghezza della finestra la scheda va su una colonna (copertina sopra). Il corpo scorre se il contenuto supera l'altezza disponibile; intestazione e azioni restano visibili.
5. **Gruppi che si aprono.** Usa un controllo vero (bottone con `aria-expanded` e `aria-controls`, oppure `<details>`/`<summary>`), con il numero di campi compilati accanto al nome del gruppo quando è chiuso. Un errore di validazione in un gruppo chiuso lo apre e porta il fuoco sul campo.
6. Fuoco: all'apertura sul campo ISBN; dopo la ricerca sul titolo; alla chiusura torna al bottone d'origine.

## Test

Aggiorna i test che parlano del pannello e aggiungine dove serve:
- «Nuovo libro» si apre come dialogo con nome «Nuovo libro»: prima solo ISBN, poi la scheda larga dopo la ricerca e dopo «Inserisci a mano»;
- i gruppi vuoti sono chiusi, quelli riempiti dalla ricerca aperti; aprirne uno mostra i suoi campi; un errore in un gruppo chiuso lo apre;
- «Modifica libro» si apre già nella scheda, con i valori del libro;
- «Salva e aggiungi un altro» torna al momento ISBN;
- il bottone che apre passa `origin` (il dialogo lo riceve); dalla palette no.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/books` (da `apps/desktop`) passa, insieme ai test dei moduli che importano il pop-up.
- `npm test -w @bookeeper/i18n` passa se aggiungi testi (italiano e inglese).
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/books/`, `modules/onboarding/FirstBookHint.tsx` e `onboarding.test.tsx`, e `books.json` (it, en).
