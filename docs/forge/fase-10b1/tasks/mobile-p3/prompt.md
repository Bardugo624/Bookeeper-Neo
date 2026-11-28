Leggi prima `docs/forge/fase-10b1/CONTRATTO.md`.

# Telefono: «Leggi» in alto e «Riprova» offline

## File
`apps/mobile/src/modules/search/` e `apps/mobile/src/modules/reader/`.

## Cosa fare
- **«Leggi» nella scheda del libro:** subito sotto titolo e autore, prima di ogni blocco, a tutta larghezza (schizzo `08`). Oggi sta sotto la card «Lettura», fuori dal primo schermo.
- **«Riprova» offline:** in un avvio a freddo senza rete e senza copia, «Riprova» ricarica anche la sessione (`me`). Il messaggio sparisce da solo quando torna la rete (evento `online`).

## Test
- `read_sits_right_under_the_title`.
- `retry_reloads_the_session_when_the_network_is_back`.

## Acceptance criteria
- `npx vitest run src/modules/search src/modules/reader` (da `apps/mobile`) e `npm run typecheck -w @bookeeper/mobile` passano.
- Guardata in Chromium a 390×844 nella build di produzione, la scheda mostra «Leggi» nel primo schermo.
