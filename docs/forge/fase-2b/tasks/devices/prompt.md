Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. La task `app-kit` è già unita: usa `apps/desktop/src/kit`. Leggi il modulo `books` esistente per struttura, hook e test.

# Dispositivi e abbinamento

## Obiettivo

Il modulo `devices` (design §6.4 e §7.1). Leggi `clients/desktop/frontend/src/modules/devices/`, le rotte `devices` e `pairing` in `crates/bookeeper-core/src/api/`, e `packages/api/src/client.ts` (`listDevices`, `renameDevice`, `revokeDevice`, `createPairingCode`, `getServerInfo`).

Unica task che può aggiungere dipendenze: `qrcode` e `@types/qrcode` in `apps/desktop/package.json`, con `npm install` dalla radice.

## Cosa fare

1. **Vista `/devices`**: `PageHeader` "Dispositivi" con conteggio. Elenco a card: icona per tipo (computer, telefono), nome, "Questo dispositivo" sul dispositivo corrente (da `me.device`), ultimo accesso (`formatRelativeDays`), stato revocato. I revocati stanno in una sezione chiusa "Revocati".
2. **Azioni**: rinomina (in linea o in dialog; limiti dal core); revoca con conferma — revocare il dispositivo corrente avvisa che si verrà disconnessi e, dopo il successo, chiama `signOut` della sessione. Dove il core chiede `confirmation_required`, usa `usePasswordConfirm`.
3. **"Aggiungi un computer"**: genera un codice di abbinamento. Dialog con il codice in caratteri grandi a spaziatura fissa, raggruppato come lo restituisce il core, bottone "Copia", conto alla rovescia fino alla scadenza (dal campo di scadenza del core; 10 minuti), istruzioni in tre passi. Alla scadenza il codice si oscura e compare "Genera un nuovo codice". Chiudere il dialog non revoca il codice. Mentre il dialog è aperto l'elenco si aggiorna ogni 5 secondi: quando compare un dispositivo nuovo, toast "Dispositivo aggiunto" e chiusura del dialog.
4. **"Aggiungi un telefono"** (D7): si mostra solo se `getServerInfo().phone_ready` è vero. Stesso codice, mostrato come QR. Leggi nel design §6.4 e nel core cosa deve contenere il QR: l'indirizzo pubblico del server con il codice nel frammento o nel percorso previsto dalla PWA; se il formato non è definito nel codice, usa `<public_url>/#/pair?code=<codice>` e dichiaralo nel rapporto. QR generato in locale con `qrcode` come SVG, con testo alternativo; sotto, l'indirizzo e il codice in chiaro.
   Se `phone_ready` è falso: al posto del bottone un riquadro informativo che spiega, senza parole tecniche, che per il telefono serve una libreria raggiungibile con un indirizzo sicuro. Nessun bottone morto.
5. **Stati**: scheletri, errore. L'elenco non è mai vuoto (c'è sempre questo dispositivo).

## Struttura

`routes.tsx` (modulo con `nav` del contratto), `index.ts` (solo ciò che altri moduli possono usare), viste, componenti, hook con `@tanstack/react-query`. Testi nello spazio dei nomi del modulo, in italiano e in inglese.

## Test

- Elenco: dispositivo corrente marcato; revocati in sezione chiusa; tempo relativo.
- Rinomina: convalida e richiesta. Revoca: conferma; revoca del corrente → `signOut`; `confirmation_required` → password → ripetizione.
- Codice: mostrato raggruppato; "Copia" scrive negli appunti (finto); conto alla rovescia con timer finti; a scadenza oscurato e rigenerabile; dispositivo nuovo nell'elenco → toast e chiusura.
- Telefono: con `phone_ready` vero il QR contiene l'indirizzo atteso (decodifica il contenuto passato a `qrcode`, non l'immagine); con `phone_ready` falso c'è il riquadro e nessun bottone "Aggiungi un telefono".
- `rate_limited` sulla generazione del codice: messaggio con i secondi.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/devices/`, `apps/desktop/package.json`, `package-lock.json`, `packages/i18n/src/locales/it/devices.json`, `packages/i18n/src/locales/en/devices.json`.
