Leggi prima `docs/forge/fase-2c/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Leggi `apps/desktop/src/kit` e un modulo esistente (`loans`) per struttura, hook e test. Ogni correzione ha un test che fallisce prima e passa dopo.

# Tre difetti P3 del run 2B1

1. **`packages/ui/src/overlays/Toast.module.css:75`** — `var(--bk-accent, …)` usa un token che non esiste. Regola: usa un token definito in `tokens.css` (controlla il contrasto sul fondo del toast nei due temi), senza ripiego.
2. **`apps/desktop/src/modules/books/useBookWrites.ts:68`** — in modifica, se la `PATCH` fallisce dopo che la `DELETE` della copertina è riuscita, la copertina è già sparita e il salvataggio dice errore; inoltre l'aggiornamento delle query parte solo al successo. Regola: prima la `PATCH` dei campi, poi le operazioni sulla copertina; le query si invalidano anche dopo un fallimento parziale; il messaggio dice cosa è stato salvato e cosa no.
3. **`apps/desktop/src/modules/books/CoverPicker.tsx:117`** — i campioni di colore compaiono anche nell'istante prima che la copertina salvata sia caricata; scegliere una tinta salva un colore su un libro che ha una copertina. Regola: i campioni compaiono solo quando è certo che il libro non ha una copertina (richiesta conclusa con "assente", oppure copertina appena rimossa nel modulo); durante il caricamento c'è uno scheletro.

## Acceptance criteria

- `npm test -w @bookeeper/ui -w @bookeeper/desktop` e `npm run typecheck -w @bookeeper/ui -w @bookeeper/desktop` passano.
- Cambiano solo: `packages/ui/src/overlays/Toast.module.css` e file sotto `apps/desktop/src/modules/books/` (compreso `BookDrawer.tsx`, dove serve per sapere se la richiesta della copertina è finita, è fallita o ha risposto "assente"). Lo scheletro del selettore non resta mai per sempre: "assente" (404) mostra i campioni; un errore di rete o 5xx mostra i campioni con un avviso e lascia rimuovere o sostituire la copertina.
