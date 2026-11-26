Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/src/kit`, il modulo che tocchi e i suoi test. Per il comportamento guarda il modulo corrispondente del desktop: si legge, non si importa. Leggi `apps/mobile/src/modules/pair` per intero.

# PWA: entrare con un invito

## Cosa fare

1. Collegamento dal QR (`LinkPage`) e codice scritto (`CodePage`): prima `inspectPairingCode`.
   - Codice di dispositivo: come oggi, senza passi in più.
   - Invito: passo con "Sei stato invitato in «Casa Rossi» come Membro", il campo "Il tuo nome" (obbligatorio, 1..60) e "Entra", che chiama `redeemPairingCode` con `display_name`.
2. Errori come oggi.
3. Il QR di un invito porta allo stesso indirizzo di quello di un dispositivo (`/#/pair?code=`).

## Test

- Invito dal collegamento e dal codice scritto; nome vuoto rifiutato; sessione aperta.
- Codice di dispositivo senza passi in più; errori.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- A 320px nessuno scorrimento orizzontale della pagina; bersagli tattili di almeno 44×44px; campi con testo di almeno 16px.
- Cambiano solo: file sotto `apps/mobile/src/modules/pair/`, i file i18n `mpair.json` (it e en).
