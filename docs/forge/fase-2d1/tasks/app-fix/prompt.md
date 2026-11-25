Leggi prima `docs/forge/fase-2d/CONTRATTO.md` e i contratti che cita. Ogni correzione ha un test che fallisce prima e passa dopo.

# App: due difetti P3 e un test instabile

1. **`modules/settings/sections/sharing/SharingSection.tsx:86`** — riaprendo la sezione su un vecchio errore `port_in_use`, il messaggio nomina la porta salvata e non quella che è fallita. Regola: il messaggio usa `attempted_port` dello stato quando c'è (campo facoltativo aggiunto a `SharingStatus` in `apps/desktop/src/platform`; il guscio lo manda dopo un cambio di porta fallito), altrimenti la porta tentata in questa sessione, altrimenti quella salvata. Aggiungi i testi per i codici nuovi `port_not_allowed` (porta riservata al sistema: scegline una da 1024 in su) e `bind_failed` nei file i18n `sharing.json` delle due lingue.
2. **`modules/updates/ReleaseNotes.tsx:5`** — la punteggiatura finale viene tolta dai link, compresa una `)` che fa parte dell'indirizzo. Regola: una `)` finale resta nel link se nell'indirizzo c'è una `(` non chiusa; `.`, `,`, `;`, `:`, `!`, `?` finali restano fuori. Casi: `https://it.wikipedia.org/wiki/Rosa_(nome)`, `(vedi https://example.org/a)`, `https://example.org/a.`.
3. **Test instabile** (`sections/sharing/sharing.test.tsx`, "names the port that was tried when the shell reports the old one"): sotto carico `findByText` scade dopo la digitazione con `userEvent`. Regola: nessun test del modulo dipende dal tempo reale. Usa `userEvent.setup({ delay: null })`, attese esplicite sullo stato e un tempo massimo di 5 secondi per le ricerche asincrone di quel file; controlla allo stesso modo gli altri test dei due moduli che toccano.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano; il file `sharing.test.tsx` passa 5 volte di fila (`for i in 1 2 3 4 5; do npx vitest run src/modules/settings/sections/sharing || exit 1; done` da `apps/desktop`).
- Cambiano solo: file sotto `apps/desktop/src/modules/settings/sections/sharing/`, `apps/desktop/src/modules/updates/`, `apps/desktop/src/platform/`, i due file i18n `sharing.json`.
