Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit` e il modulo che tocchi, con i test. Leggi `apps/desktop/src/modules/welcome` per intero (`useJoin.ts`, `JoinCard.tsx`, `errors.ts`, `connections.ts`) con i test.

# Desktop: entrare con un invito

## Cosa fare

1. Nel percorso "Unisciti" con il codice: dopo indirizzo e codice si chiama `inspectPairingCode`.
   - Codice di dispositivo: riscatto come oggi, senza passi in più.
   - Invito: secondo passo con "Sei stato invitato in «Casa Rossi» come Membro", il campo "Il tuo nome" (obbligatorio, 1..60 caratteri) e "Entra", che chiama `redeemPairingCode` con `display_name`.
2. "Indietro" dal secondo passo torna al codice senza perdere l'indirizzo.
3. Codice non valido, usato o scaduto: messaggio sul campo del codice, come oggi. Troppi tentativi: messaggio dedicato.
4. Il nome del dispositivo resta quello di oggi.

## Test

- Invito: secondo passo con libreria e ruolo, nome vuoto rifiutato, riscatto con `display_name`, sessione aperta.
- Codice di dispositivo: nessun passo in più.
- Errori: codice non valido, troppi tentativi; "Indietro".

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- Cambiano solo: file sotto `apps/desktop/src/modules/welcome/`, i file i18n `welcome.json` (it e en).
