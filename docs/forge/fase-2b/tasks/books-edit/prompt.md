Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. La task `app-kit` è già unita: usa `apps/desktop/src/kit`. Leggi il modulo `books` esistente per struttura, hook e test. La task `loans` è già unita: usa `LendDialog` e `useActiveLoan` dal suo `index.ts`.

# Libri: aggiungi, modifica, elimina, lookup ISBN, copertine

## Obiettivo

Completare il modulo `books` a parità con la 0.3 (design §7.1): oggi è in sola lettura. Leggi `clients/desktop/frontend/src/modules/books/`, `packages/api/src/resources/{books,lookup,covers}.ts` e `crates/bookeeper-core/src/api/{books,lookup,covers}.rs`.

## Cosa fare

1. **"Aggiungi"** nell'intestazione dell'elenco (bottone primario del mockup, con permesso di scrittura). `Drawer` "Nuovo libro" in due passi:
   - **Cerca per ISBN**: campo ISBN (accetta 10 o 13 cifre con o senza trattini; convalida della cifra di controllo prima di chiamare), bottone "Cerca". Chiama il lookup del core: leggi come si sceglie o si scorre tra i fornitori (Google Books, Open Library, Anna's Archive) e cosa restituisce. Risultato trovato → il modulo si riempie e mostra da quale fornitore; non trovato → messaggio e modulo vuoto con l'ISBN già inserito; errore o `rate_limited` → messaggio, il modulo resta usabile. "Inserisci a mano" salta la ricerca.
   - **Modulo**: tutti i campi di `CreateBook` raggruppati (Essenziali: titolo, sottotitolo, autori come elenco modificabile; Edizione: editore, anno, lingua, pagine, formato, ISBN-10 e ISBN-13; Raccolta: genere, numero progressivo, condizione, data d'acquisto, prezzo; Note: descrizione, note). Limiti e valori ammessi dal core. **Numero progressivo**: proposto dal core (`NextProgressive`), modificabile; conflitto → messaggio accanto al campo.
   - ISBN già presente in libreria (codice d'errore vero del core): messaggio con link al libro esistente.
   - "Salva e aggiungi un altro" tiene aperto il pannello e azzera il modulo.
2. **Copertina** nel modulo: se il lookup ne offre una, anteprima e scelta "Usa questa copertina" (rotta di recupero del core); "Carica un'immagine" da file (tipi e peso massimo dal core; `requestRaw`); "Rimuovi". Senza copertina: scelta del colore del segnaposto tra le tinte `clothTone` (campo `cover_color`).
3. **Scheda libro**: bottoni "Modifica" (stesso modulo, con `PatchBook`: si mandano solo i campi cambiati), "Presta" (`LendDialog`) oppure, se in prestito, la scheda "Prestiti" mostra a chi e da quando (`useActiveLoan`) con link a `/loans?book=<id>`; menu "Altro" con "Elimina" (conferma; dopo il successo si torna all'elenco con un toast). "Dove si trova" collega a `/shelves?unit=<id>&book=<id>`. "Segna come letto" NON esiste: lo stato di lettura non è nel core.
4. **Eliminazione multipla** nell'elenco: modalità selezione (bottone "Seleziona"; in griglia una casella sulla copertina, in lista una colonna di caselle; Maiusc-clic seleziona un intervallo; `Ctrl A` seleziona i caricati). Barra in basso "N selezionati · Elimina · Annulla". Conferma che dice quanti; rotta `batch-delete`; il risultato del core (eliminati e non) va in un toast.
5. Dopo ogni scrittura: invalidazione di elenco, dettaglio, conteggi, `stats`, e delle query di prestiti e scaffali dove toccate.

## Struttura

`routes.tsx` (modulo con `nav` del contratto), `index.ts` (solo ciò che altri moduli possono usare), viste, componenti, hook con `@tanstack/react-query`. Testi nello spazio dei nomi del modulo, in italiano e in inglese.

Il modulo esistente resta: non riscrivere ciò che funziona. I componenti nuovi stanno in file nuovi; i file esistenti cambiano solo dove serve un aggancio.

## Test

- ISBN: cifra di controllo per ISBN-10 (con `X`) e ISBN-13; trattini e spazi tollerati; non valido → nessuna chiamata.
- Lookup: trovato → campi riempiti e fornitore mostrato; non trovato; `rate_limited`; errore di rete; "Inserisci a mano".
- Creazione: campi obbligatori, limiti, corpo della richiesta senza campi vuoti; numero progressivo proposto e conflitto; ISBN duplicato con link.
- "Salva e aggiungi un altro".
- Copertina: usa quella del lookup; carica file (tipo non ammesso e file troppo grande rifiutati prima dell'invio); rimuovi; colore del segnaposto.
- Modifica: `PATCH` con i soli campi cambiati; nessuna richiesta se nulla è cambiato.
- Scheda: "Presta" apre `LendDialog`; libro in prestito mostra a chi; "Elimina" con conferma e ritorno all'elenco.
- Selezione multipla: intervallo con Maiusc; `Ctrl A`; conferma con il numero; toast col risultato parziale.
- Senza permesso di scrittura: nessun bottone "Aggiungi", "Modifica", "Presta", "Elimina", "Seleziona".
- I test esistenti del modulo restano verdi, salvo quello che vieta i bottoni ora richiesti: aggiornalo.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/books/`, `packages/i18n/src/locales/it/books.json`, `packages/i18n/src/locales/en/books.json`.
