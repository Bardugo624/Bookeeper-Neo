Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# UI: mobile con ripiani e dorsi

## Obiettivo

Consegnare `@bookeeper/ui/shelf` secondo il contratto: il mobile della schermata "03 — Scaffali" del mockup. Riferimento di comportamento: `ShelfSvg` della 0.3 (cercalo in `clients/desktop/frontend/src`) e il paragrafo "Scaffali (ShelfSvg)" di `DESIGN.md`. Non copiare il codice Vue. NON aggiungere dipendenze.

## Cosa fare

Tutto sotto `packages/ui/src/shelf/`. Aggiungi la voce `./shelf` agli `exports` di `packages/ui/package.json` (unica modifica a quel file).

- **`ShelfUnit`**: cornice nel colore del mobile con venatura leggera, fondale scurito (`color-mix` col nero al 45%), una fascia per ripiano con mensola dotata di spessore e ombra portata. Dentro ogni fascia i dorsi, allineati in basso, larghezza `spineWidth(pages)`, altezza `spineHeight(id)`, colore `color ?? clothTone(title)` (importa `clothTone` da `../book`), sfumatura di cilindricità condivisa. Se i dorsi superano la larghezza del ripiano, la fascia scorre in orizzontale. Posti vuoti: se `capacity` è dato e i libri sono meno, si disegnano fino a 6 posti vuoti chiari al 12%.
- **Dorso**: è un bottone con nome accessibile "titolo, autore". Al passaggio e al fuoco si sfila (`translateY(-2.5px)`, più luminoso) e mostra un `Tooltip` con titolo in grassetto e "autore · N pagine" (i testi arrivano da fuori: proprietà `spineLabel(book)` che restituisce `{ title, detail }`; nessun testo scritto nel componente). `selectedId` evidenzia un dorso con bordo `--bk-primary-300`.
- **Trascinamento**: i dorsi sono trascinabili (HTML Drag and Drop, tipo `application/x-bookeeper-book` con l'id). Un ripiano accetta il rilascio di quel tipo e chiama `onSlotDrop({ bookId, rowId, index })`, dove `index` è la posizione tra i dorsi calcolata dal punto di rilascio. Durante il trascinamento sopra un ripiano compare il posto tratteggiato del mockup nel punto d'inserimento. Anche un elemento esterno può essere trascinato sul ripiano (stesso tipo di dato).
- **Tastiera**: stessa operazione senza puntatore. Con un dorso a fuoco, Spazio lo "prende"; frecce sinistra/destra spostano il punto d'inserimento, su/giù cambiano ripiano; Spazio o Invio rilasciano (stesso `onSlotDrop`); Esc annulla. Una regione `aria-live` annuncia le fasi con testi dati da fuori (proprietà `announce`).
- **Ingresso**: i dorsi entrano a scaglioni per colonna (14 ms, tetto 400 ms), solo con movimento permesso.
- I colori dei mobili e il gradiente dei dorsi sono gli unici colori ammessi fuori da `tokens.css`: stanno in un solo file `colors.ts`.

## Test

- `spineWidth`: 12 a 80 pagine o meno, 34 a 900 o più, lineare in mezzo, 20 senza pagine; `NaN`, zero, negativi come assente; `Infinity` come 900.
- `spineHeight`: tra 86 e 100, deterministica.
- Resa: un bottone per libro con il nome giusto; ripiani in ordine; posti vuoti secondo `capacity` (mai più di 6; nessuno se pieno).
- Tooltip: al fuoco compaiono titolo e dettaglio da `spineLabel`.
- Trascinamento: eventi `dragstart`/`dragover`/`drop` simulati con un `DataTransfer` finto → `onSlotDrop` con `bookId`, `rowId`, `index` corretti all'inizio, in mezzo e in fondo; un tipo di dato diverso è ignorato.
- Tastiera: Spazio, freccia destra due volte, freccia giù, Invio → `onSlotDrop` con ripiano e indice attesi; Esc non chiama nulla; gli annunci passano per `announce`.
- `onSpineClick` con Invio e clic; `selectedId` marca il dorso (`aria-pressed` o `aria-current`).
- Test di stile con `styleCheck` anche per `src/shelf`.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` e `npm test -w @bookeeper/ui` passano.
- `import { ShelfUnit, spineWidth, spineHeight, SHELF_COLORS } from '@bookeeper/ui/shelf'` compila da un file di test.
- Nessun componente supera 250 righe.
- Cambiano solo: `packages/ui/package.json` (una riga in `exports`) e file sotto `packages/ui/src/shelf/`.
