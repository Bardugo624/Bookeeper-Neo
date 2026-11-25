Leggi prima `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit`, il modulo che tocchi e i suoi test. Le task `reading-ui`, `tags-ui` e `rooms-ui` sono già unite: parti dal loro lavoro.

# Filtri avanzati e ordinamenti nei Libri

## Cosa fare

1. **Bottone "Filtri"** accanto alle pillole (mockup "02"), con il numero dei filtri attivi. Apre un `Drawer` con, da `GET /books/facets`: stato di lettura, tag (scelta multipla: il libro ha tutti i tag scelti), stanza, scaffale (dipende dalla stanza scelta), genere, lingua, formato, anno di pubblicazione (da–a, entro `years.min`–`years.max`), data d'acquisto (da–a), in prestito. Ogni valore mostra il conteggio. "Azzera" e "Mostra N libri" (il numero si aggiorna a ogni modifica con una richiesta `limit=1` dopo 300 ms).
2. **Filtri attivi** come etichette rimovibili sotto le pillole, con "Azzera tutto".
3. **Ordinamento**: menu "Ordina per" con tutti gli ordinamenti del contratto 4A e verso crescente/decrescente; in lista le intestazioni ordinabili usano gli stessi valori.
4. Tutto nell'indirizzo (`reading`, `tag` ripetuto, `room`, `shelf`, `genre`, `language`, `format`, `year_from`, `year_to`, `acquired_from`, `acquired_to`, `on_loan`, `sort`, `order`): un indirizzo copiato riapre la stessa vista. Le pillole rapide e il pannello restano coerenti tra loro.
5. **Filtri salvati**: "Salva questa vista" dà un nome alla combinazione corrente e la tiene in `localStorage` sotto l'id della connessione (al più 10); le viste salvate stanno in un menu accanto a "Filtri", con rinomina ed eliminazione.
6. `/books?new=1` apre il pannello "Nuovo libro" e toglie il parametro dall'indirizzo.
7. La ricerca testuale si combina con i filtri. Nessun risultato: stato dedicato che elenca i filtri attivi e offre di toglierli uno a uno.

## Test

- Ogni filtro manda il parametro giusto; `tag` doppio → due `tag_id`; scaffali limitati alla stanza.
- Conteggi dalle faccette; "Mostra N libri" con timer finti.
- Etichette attive e rimozione singola; "Azzera tutto".
- Ordinamento dal menu e dalle intestazioni, coerenti.
- Andata e ritorno dall'indirizzo: stato → indirizzo → stesso stato; indirizzo con valori non validi → ignorati senza errore.
- Viste salvate: salva, applica, rinomina, elimina, limite di 10, separate per connessione.
- `?new=1`.
- I test esistenti del modulo restano verdi.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/books/`, i file i18n `books.json`.
