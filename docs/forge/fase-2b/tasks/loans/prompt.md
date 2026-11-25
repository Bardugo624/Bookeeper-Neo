Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. La task `app-kit` è già unita: usa `apps/desktop/src/kit`. Leggi il modulo `books` esistente per struttura, hook e test.

# Prestiti

## Obiettivo

Il modulo `loans` a parità con la 0.3. Leggi `clients/desktop/frontend/src/modules/loans/`, `packages/api/src/resources/loans.ts` e `crates/bookeeper-core/src/api/loans.rs` (campi, filtri, regole, codici d'errore).

## Cosa fare

1. **Vista `/loans`**: `PageHeader` "Prestiti" con conteggio ("N in corso · M in ritardo"); filtri `PillTabs`: In corso, In ritardo, Restituiti, Tutti (nell'indirizzo); ricerca per persona o titolo se l'API la offre, altrimenti niente campo. Elenco a card (non tabella): copertina piccola del libro (`BookCover` 48px, collegata alla scheda libro), titolo, a chi, dal, scadenza, stato. **Mai strisce laterali colorate**: lo stato tinge l'intero bordo della card mescolando il tono col token del bordo, con velatura di fondo solo per "in ritardo"; l'etichetta `StatusTag` resta l'indicatore esplicito. Il parametro `?book=<id>` filtra per libro.
2. **Azioni** (solo con permesso di scrittura): "Nuovo prestito" (scelta del libro con ricerca tra i libri non in prestito, persona, contatto facoltativo, data, scadenza facoltativa, note); "Modifica"; "Segna come restituito" (con data, predefinita oggi); "Riapri" per un prestito restituito; "Elimina" con conferma. Regole di convalida dal core (scadenza non prima della data, libro già in prestito → messaggio dedicato dal codice d'errore vero).
3. **`LendDialog`** e **`useActiveLoan(bookId)`** esportati da `index.ts` secondo il contratto: `LendDialog` è il modulo "Nuovo prestito" con il libro già fissato.
4. **Stati**: scheletri, vuoto per ogni filtro (testo diverso per "nessun prestito in corso" e "nessun prestito in ritardo"), errore con "Riprova".
5. In ritardo = scadenza passata e non restituito: se il core espone già il campo, usalo; altrimenti calcolalo in un solo punto, con `now` passabile nei test.

## Struttura

`routes.tsx` (modulo con `nav` del contratto), `index.ts` (solo ciò che altri moduli possono usare), viste, componenti, hook con `@tanstack/react-query`. Testi nello spazio dei nomi del modulo, in italiano e in inglese.

## Test

- Elenco, conteggi e plurali; ogni filtro manda i parametri giusti ed è nell'indirizzo; `?book=`.
- Card: bordo e velatura per stato tramite attributo `data-status`; nessun `border-left` colorato nei CSS del modulo (test che legge i `.module.css`).
- Nuovo prestito: convalida, corpo della richiesta, invalidazione di elenco e libro; libro già in prestito → messaggio dedicato.
- Restituzione con data; riapertura; modifica; eliminazione con conferma.
- `LendDialog` con libro fissato non mostra la scelta del libro.
- `useActiveLoan`: libro in prestito e libro libero.
- Senza permesso di scrittura nessun bottone di azione è nel DOM.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/loans/`, `packages/i18n/src/locales/it/loans.json`, `packages/i18n/src/locales/en/loans.json`.
