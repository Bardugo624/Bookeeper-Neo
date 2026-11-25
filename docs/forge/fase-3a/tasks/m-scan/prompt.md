Leggi prima `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Le task `m-foundation`, `m-foundation-2` e `m-search-b` (modulo `search`) sono già unite. Leggi `apps/mobile/src/platform` (fotocamera e lettore di codici), `apps/mobile/src/modules/search` (per collegarti alla scheda libro: solo per indirizzo, senza importare file interni), `packages/api/src/resources/{books,lookup}.ts`, i ruoli richiesti dal core per creare un libro, e `clients/mobile-web/src/views/ScanView.vue` della 0.3 (flusso e messaggi).

# Mobile: scansione ISBN

## Cosa fare

Modulo `scan` con scheda "Scansiona" (ordine 20), rotta `/scan`.

1. **Fotocamera**: anteprima a tutto schermo con una cornice di mira; richiesta del permesso solo all'ingresso nella scheda; la fotocamera si ferma uscendo dalla scheda, quando la pagina va in secondo piano (`visibilitychange`) e allo smontaggio. Torcia se disponibile. Cambio fotocamera se ce n'è più di una.
2. **Permesso negato o fotocamera assente**: stato dedicato che spiega come riattivarlo e offre "Scrivi l'ISBN a mano" (campo numerico con convalida della cifra di controllo, ISBN-10 e ISBN-13).
3. **Lettura**: un codice valido (EAN-13 con prefisso 978 o 979, oppure ISBN-10) fa una vibrazione breve se disponibile e apre un `BottomSheet` col risultato; lo stesso codice non viene riletto finché il pannello è aperto; codici non ISBN sono ignorati con un avviso discreto. Convalida e conversione ISBN in funzioni pure dentro il modulo.
4. **Risultato**:
   - **Già in libreria** (ricerca per ISBN nelle due forme): copertina, titolo, "È nella tua libreria", dove si trova, e "Apri la scheda" → `/books/<id>`.
   - **Non in libreria**: lookup del core. Trovato → titolo, autori, copertina se offerta, e, per chi può scrivere, "Aggiungi alla libreria" (`POST /books` con i dati del lookup, più la copertina tramite la rotta di recupero se offerta); dopo il successo "Aggiunto" con "Apri la scheda" e "Scansiona un altro". Chi non può scrivere vede solo i dati.
   - **Nessun dato trovato**: lo dice e, per chi può scrivere, offre "Aggiungi con il solo ISBN e titolo" (un campo per il titolo).
   - Errori: `rate_limited`, rete, doppione (il core dice che esiste già → trattalo come "Già in libreria").
5. **Scansione in serie**: chiuso il pannello la lettura riprende subito. Un contatore discreto dice quanti libri sono stati aggiunti in questa sessione.

Testi nello spazio dei nomi `mscan`.

## Test

Con fotocamera e lettore finti (il lettore finto emette codici a comando):

- ISBN: cifre di controllo, conversione 10↔13, prefisso 979 senza forma a 10, codice non ISBN ignorato.
- Avvio e arresto della fotocamera: entrando, uscendo, `visibilitychange`, smontaggio (nessuna traccia attiva resta).
- Permesso negato → stato dedicato e inserimento a mano funzionante.
- Già in libreria → pannello con "Apri la scheda"; trovato cercando l'altra forma dell'ISBN.
- Non in libreria con lookup trovato → "Aggiungi" manda il corpo atteso; successo → contatore a 1; senza permesso di scrittura nessun bottone di aggiunta.
- Lookup senza dati → aggiunta con titolo; `rate_limited`; rete; doppione dal core.
- Lo stesso codice letto dieci volte col pannello aperto → una sola ricerca; chiuso il pannello la lettura riprende.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile`, `npm test -w @bookeeper/i18n`, `npm run build -w @bookeeper/mobile` passano.
- Nessun componente supera 250 righe.
- Cambiano solo: file sotto `apps/mobile/src/modules/scan/`, `packages/i18n/src/locales/{it,en}/mscan.json`.
