Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. La task `app-kit` è già unita: usa `apps/desktop/src/kit`. Leggi il modulo `books` esistente per struttura, hook e test. La task `ui-shelf` è già unita: usa `@bookeeper/ui/shelf`.

# Scaffali: configurazione, assegnazione, riempimento

## Obiettivo

Il modulo `shelves`, la schermata "03 — Scaffali" del mockup, a parità con la 0.3. Leggi `clients/desktop/frontend/src/modules/shelves/`, `packages/api/src/resources/shelves.ts` e `crates/bookeeper-core/src/api/shelves.rs`: il modello vero (mobile, ripiani, capienza, posizione, colore) è quello del core; adatta i nomi del mockup a quello.

## Cosa fare

1. **Vista `/shelves`**: `PageHeader` "Scaffali" con "N mobili · M libri collocati" e bottone "Nuovo mobile". Schede dei mobili con `PillTabs` e pallino del colore (`dot`); il mobile scelto è nell'indirizzo (`?unit=<id>`). A sinistra `ShelfUnit` con i libri del mobile divisi per ripiano; a destra il pannello del mockup: nome, stanza o descrizione se il core l'ha, riempimento con `FillBar` tono `auto` e "N libri · circa M posti liberi" (solo se il core ha una capienza), elenco "Non collocati" con conteggio.
2. **Non collocati**: elenco dei libri senza collocazione (`unshelved=true`), con ricerca; ogni riga ha maniglia, copertina piccola, titolo, autore. Le righe si trascinano su un ripiano (tipo di dato del contratto `ui-shelf`); da tastiera, un menu "Colloca in…" per riga con mobile e ripiano.
3. **Assegnazione**: `onSlotDrop` chiama la rotta di collocazione del core con mobile, ripiano e posizione. Aggiornamento ottimistico dell'ordine con ripristino e toast in caso d'errore. Spostare un dorso da un ripiano all'altro usa la stessa rotta. "Togli dallo scaffale" dal menu del dorso (clic sul dorso apre un piccolo menu: Apri scheda, Togli dallo scaffale). L'assegnazione multipla (`batch-assign`) si usa per "Colloca tutti i selezionati" se la 0.3 l'aveva; leggi e porta lo stesso flusso.
4. **Configurazione**: "Nuovo mobile" e "Modifica mobile" in `FormDialog`: nome, colore (campioni `SHELF_COLORS`, uno selezionabile, con nome accessibile), numero di ripiani, capienza e altri campi del core. Elimina con conferma: leggi nel core cosa succede ai libri collocati e dillo nel testo della conferma.
5. **Stati**: nessun mobile → stato vuoto con "Crea il primo mobile"; mobile vuoto → ripiani vuoti con invito a trascinare; scheletri; errore.
6. Clic su un dorso con "Apri scheda" porta a `/books/<id>`. Arrivando da `/shelves?unit=<id>&book=<id>` il dorso di quel libro è evidenziato (`selectedId`).

## Struttura

`routes.tsx` (modulo con `nav` del contratto), `index.ts` (solo ciò che altri moduli possono usare), viste, componenti, hook con `@tanstack/react-query`. Testi nello spazio dei nomi del modulo, in italiano e in inglese.

## Test

- Schede dei mobili e `?unit=`; pannello con riempimento e toni; "posti liberi" assente senza capienza.
- Non collocati: elenco, ricerca, conteggio.
- Trascinamento da "Non collocati" a un ripiano → richiesta con mobile, ripiano, posizione; ordine aggiornato subito; errore → ripristino e toast.
- Spostamento tra ripiani; "Togli dallo scaffale"; menu "Colloca in…" da tastiera.
- Nuovo mobile e modifica: convalida, corpo; elimina con conferma e testo sulle conseguenze.
- `?book=` evidenzia il dorso.
- Senza permesso di scrittura: nessun trascinamento attivo e nessun bottone di modifica.
- Stati vuoti, scheletri, errore.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/shelves/`, `packages/i18n/src/locales/it/shelves.json`, `packages/i18n/src/locales/en/shelves.json`.
