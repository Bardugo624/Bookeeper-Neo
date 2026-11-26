Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/src/kit`, il modulo che tocchi e i suoi test. Per il comportamento guarda il modulo corrispondente del desktop: si legge, non si importa. La task `m-book-edit` è già unita: parti dal suo codice.

# PWA: prestiti

## Cosa fare

1. Modulo nuovo `apps/mobile/src/modules/loans` con la scheda "Prestiti" nella barra in basso (dopo "Scansiona") e la rotta `/loans`:
   - "In corso": prima gli scaduti, con "scaduto da 3 giorni".
   - "Restituiti": i più recenti prima.
   - Riga: copertina, titolo, persona (icona se è un membro), scadenza. Il tocco apre la scheda del libro.
2. "Restituisci" sulla riga, per chi può scrivere: conferma in un `BottomSheet`, poi `POST /loans/{id}/return`.
3. `LendSheet`, esportato: persona (prima le persone di `GET /users`, poi i nomi di `GET /loans/borrowers?q=`), scadenza facoltativa (campo data), nota facoltativa. Invia `POST /loans`.
4. Nella scheda del libro, blocco del prestito: "Presta" se il libro non è in prestito, "Restituisci" se lo è. Solo per chi può scrivere.

## Test

- Elenco: ordine, "scaduto da", riga con membro.
- Restituzione con conferma.
- `LendSheet`: con una persona (corpo con `borrower_user_id`) e con un nome libero.
- Blocco nella scheda nei due stati, e per un ospite.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- A 320px nessuno scorrimento orizzontale della pagina; bersagli tattili di almeno 44×44px; campi con testo di almeno 16px.
- Cambiano solo: file sotto `apps/mobile/src/modules/loans/` (nuovo) e `apps/mobile/src/modules/search/`, i file i18n `mloans.json` (nuovo) e `msearch.json` (it e en).
