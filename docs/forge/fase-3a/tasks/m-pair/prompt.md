Leggi prima `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. La task `m-foundation` è già unita. Leggi `apps/mobile/src/{app,session,kit,platform}`, `crates/bookeeper-core/src/api/pairing.rs` (campi, codici d'errore, scadenza) e `clients/mobile-web/src/views/Pair*.vue` della 0.3.

# Mobile: abbinamento da QR o codice

## Cosa fare

Modulo `pair` con le rotte pubbliche del contratto.

1. **Da QR** (`/#/pair?code=<codice>`): schermata "Collega questo telefono" con il nome del dispositivo proposto e modificabile, e il bottone "Collega". Al tocco: `POST /pairing/redeem` con `device_kind: "mobile"`. Successo → sessione salvata, il codice sparisce dall'indirizzo (`replace`), si va a `/search`. Il codice non viene mai riscattato da solo all'apertura della pagina: serve il tocco.
2. **Senza codice** (`/pair`): spiega in tre passi come ottenere il QR dal computer (Dispositivi → Aggiungi un telefono) e offre "Ho un codice" → `/pair/code`.
3. **Con codice** (`/pair/code`): campo unico per il codice (maiuscolo automatico, trattini e spazi tollerati, tastiera adatta, incolla), nome del dispositivo, "Collega".
4. **Errori**: codice sbagliato o scaduto (codice vero del core) → messaggio che dice di generarne uno nuovo dal computer; `rate_limited` con i secondi; rete. Dopo un errore il codice resta nel campo.
5. **Già collegato**: aprendo un link di abbinamento con una sessione valida, si chiede "Questo telefono è già collegato a <libreria>. Vuoi collegarlo di nuovo?" con "Tieni la libreria attuale" e "Collega di nuovo".
6. Doppio tocco: una sola richiesta. Durante la richiesta il bottone è in `loading` (con etichetta).

Testi nello spazio dei nomi `mpair`.

## Test

- Link con codice: nessuna richiesta finché non si tocca "Collega"; corpo con `code`, `device_name`, `device_kind: "mobile"`; successo → sessione `ready`, indirizzo senza codice, rotta `/search`.
- Codice a mano: normalizzazione (minuscole, spazi, trattini); campo vuoto → errore.
- Codice scaduto, `rate_limited` con secondi, rete: tre messaggi distinti; il codice resta.
- Già collegato: i due esiti.
- Doppio tocco → una richiesta.

## Aggiunta dopo il primo giro di revisione

La task `m-foundation-2` è unita: con una sessione valida le rotte `/pair` restano raggiungibili quando l'indirizzo porta un `code`. Il test "già collegato" DEVE montare l'app vera con `renderMobile` e il cancello di sessione, non il componente da solo.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile`, `npm test -w @bookeeper/i18n`, `npm run build -w @bookeeper/mobile` passano.
- Cambiano solo: file sotto `apps/mobile/src/modules/pair/`, `packages/i18n/src/locales/{it,en}/mpair.json`.
