Leggi prima `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit`, il modulo che tocchi e i suoi test. Leggi anche `apps/desktop/src/app/` e `src/shell/`.

# Palette dei comandi e scorciatoie

## Cosa fare

1. **Modulo `palette`** (senza voce di navigazione, raccolto come gli altri moduli; se un modulo senza rotte non viene montato, aggiungi il punto di montaggio in `app/`, che è tra i tuoi file). `Ctrl K`/`Cmd K` apre un dialog centrato in alto, largo 640, con un campo e un elenco di risultati a gruppi:
   - **Vai a**: una voce per ogni modulo con `nav`, più le sezioni delle impostazioni.
   - **Libri**: da due caratteri, ricerca nel catalogo con ritardo di 200 ms (al più 8 risultati), con copertina piccola, titolo, autore. Invio apre la scheda.
   - **Dov'è?**: scrivendo `dov'è` o `dove` seguito da un titolo, oppure scegliendo l'azione "Dov'è un libro?", i risultati dei libri mostrano la collocazione (mobile, ripiano) e Invio porta a `/shelves?unit=…&book=…`; un libro non collocato lo dice e apre la scheda.
   - **Azioni**: Nuovo libro (`/books?new=1`, solo con permesso di scrittura), Nuovo prestito (`/loans?new=1` solo se il modulo prestiti lo supporta già: leggi; altrimenti omettila), Tema chiaro/scuro/sistema, Scorciatoie da tastiera, Esci.
   Senza testo: le azioni e "Vai a". La corrispondenza ignora maiuscole e accenti. Frecce su/giù, Invio, Esc; il fuoco resta nel campo e l'opzione attiva è indicata con `aria-activedescendant` (schema combobox con listbox). Nessun risultato: riga dedicata.
2. **Scorciatoie** del contratto, in un solo hook in `app/`, con le regole su campi di testo e dialog. `useSearchShortcut` passa da `Ctrl K` a `/`; aggiorna il test.
3. **Elenco delle scorciatoie**: dialog aperto da `?` e dalla palette, con la tabella del contratto; i tasti mostrati con `Kbd`; su macOS `Cmd` al posto di `Ctrl` (rilevato dalla piattaforma del browser).
4. Un accenno discreto nella sidebar (`shell`): riga "Cerca o lancia un comando" con `Ctrl K`, che apre la palette.

Testi nello spazio dei nomi `palette`.

5. **Libri**: il campo di ricerca dei Libri mostra il tasto `/` al posto di `Ctrl K` (`modules/books/SearchField.tsx`, chiavi `books.search.hint` e `hintMac` nelle due lingue) e il test `BooksPage.test.tsx` che premeva `Ctrl K` per il fuoco ora preme `/`. Sono le uniche modifiche al modulo Libri: le task `reading-ui` e `tags-ui` sono già unite, non toccare altro.

## Test

- Apertura con `Ctrl K` e `Cmd K`; chiusura con Esc; il fuoco torna dov'era.
- Navigazione: scrivendo "scaff" e Invio si va a `/shelves`; accenti e maiuscole ignorati.
- Libri: ritardo con timer finti, una sola richiesta, Invio apre la scheda.
- "Dov'è": libro collocato → indirizzo dello scaffale con `unit` e `book`; non collocato → scheda.
- Azioni: "Nuovo libro" assente senza permesso; tema cambia; "Esci" chiama `signOut`.
- Combobox: ruoli, `aria-activedescendant` che segue le frecce, giro dall'ultima alla prima.
- Scorciatoie: `g` poi `s` naviga; in un campo di testo non scatta; con un dialog aperto non scatta; `/` porta il fuoco alla ricerca della vista; `?` apre l'elenco.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/palette/`, `apps/desktop/src/app/`, `apps/desktop/src/shell/`, i due file i18n `palette.json`; nel modulo Libri solo `SearchField.tsx`, `BooksPage.test.tsx` e le due chiavi in `books.json`.
