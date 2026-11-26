Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit` e il modulo che tocchi, con i test. Leggi anche `apps/desktop/src/modules/devices` per intero e `apps/desktop/src/modules/settings/sections/audit/useDescribe.ts`.

# Desktop: persone

## Cosa fare

1. Modulo nuovo `apps/desktop/src/modules/people`, con la rotta `/people` e la voce "Persone" nella barra laterale (gruppo `bottom`, accanto a "Dispositivi", con un'icona già disponibile). La vedono tutti i ruoli.
2. **Elenco** (`GET /users`), nell'ordine del server: nome, ruolo, "Tu", numero di dispositivi, ultimo accesso; l'email solo se il server la manda.
3. **Azioni**, secondo "Chi gestisce chi" del contratto 6A. La regola sta in una funzione pura del modulo, provata su tutte le coppie di ruoli. Menu della persona:
   - "Cambia ruolo": dialog a radio con i soli ruoli che chi agisce può assegnare.
   - "Rinomina".
   - "Rimuovi": il dialog elenca le conseguenze (dispositivi scollegati; stato di lettura e wishlist cancellati; libri e prestiti restano).
   - "Rendi proprietario" (solo il proprietario): il dialog dice che chi agisce diventa admin; il bottone di conferma ripete il nome della persona.
   - Sulla propria riga: "Rinomina" e, tranne per il proprietario, "Esci dalla libreria". Dopo l'uscita la sessione si chiude e l'app torna all'inizio, come "Esci" nell'account.
4. **Inviti** (admin e proprietario): "Invita una persona" apre un dialog con ruolo (Admin solo per il proprietario; predefinito Membro) e durata (1, 7 o 30 giorni; predefinito 7). Dopo la creazione mostra il codice con `CodeBlock` e, se il server ha un indirizzo HTTPS pubblico, il QR per il telefono con `QrCode`, con la stessa regola di `PairDialog`. Testo: "Sul computer: Unisciti, poi il codice. Sul telefono: inquadra il QR." Sotto l'elenco, "Inviti in attesa": ruolo, chi l'ha creato, scadenza, "Revoca".
5. Dopo un cambio proprietario si ricarica `me` come fa la sessione all'avvio: il proprio ruolo è cambiato.
6. **Registro attività**: le azioni nuove (`user.update`, `user.remove`, `user.join`, `library.owner`, `invite.create`, `invite.revoke`) hanno una frase propria in `useDescribe`, nelle due lingue.
7. `CodeBlock`, `QrCode` e ciò che serve a calcolare l'indirizzo per il telefono si importano da `apps/desktop/src/modules/devices/index.ts`: aggiungi lì le esportazioni che mancano, senza cambiare altro in quel modulo.

## Test

- Elenco, ordine, "Tu", email presente o assente.
- Azioni visibili per ruolo: ospite, membro, admin su un membro e su un admin, proprietario.
- Cambio di ruolo, rinomina, rimozione, uscita, cambio proprietario: richieste giuste, aggiornamento di `me`, errori con messaggio.
- Invito: ruoli offerti secondo chi agisce, codice mostrato, QR solo con indirizzo HTTPS; revoca.
- Frasi del registro per le azioni nuove.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- Cambiano solo: file sotto `apps/desktop/src/modules/people/`, `apps/desktop/src/modules/devices/index.ts`, file sotto `apps/desktop/src/modules/settings/sections/audit/`, i file i18n `people.json` (nuovo) e `audit.json` (it e en).
