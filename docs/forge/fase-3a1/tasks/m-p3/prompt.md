Leggi prima `docs/forge/fase-3a/CONTRATTO.md`. Ogni correzione ha un test che fallisce prima e passa dopo.

# Mobile: due difetti P3 del run 3A

1. **`apps/mobile/src/session/authTransport.ts:127`** — dopo un rinnovo, qualunque 401 sulla ripetizione scollega il telefono, anche un errore di credenziali come `invalid_credentials` che non riguarda la sessione. Regola: dopo il rinnovo si scollega solo se la ripetizione risponde 401 con un codice di sessione (`unauthorized`, `token_expired`, `device_revoked`); ogni altro 401 torna al chiamante com'è. Vale per `request` e `requestRaw`.
2. **`apps/mobile/src/modules/pair/LinkPage.tsx:20`** — un link il cui `code` è fatto solo di trattini (`/#/pair?code=-`) mostra la pagina di collegamento, e al tocco su "Collega" compare un messaggio pensato per il codice scritto a mano. Regola: un `code` che dopo la normalizzazione è vuoto vale come assente: si mostra la pagina senza codice, con i tre passi e "Ho un codice".

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile`, `npm test -w @bookeeper/i18n`, `npm test -w @bookeeper/ui` passano.
- Cambiano solo: file sotto `apps/mobile/src/session/` e `apps/mobile/src/modules/pair/`, e i due file i18n `mpair.json` solo se serve un testo.
