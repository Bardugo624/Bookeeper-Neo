Leggi prima `docs/forge/fase-7b/CONTRATTO.md`, `docs/forge/fase-7b/AUDIT.md`, `PRODUCT.md` e `DESIGN.md`. Le task `people-cache`, `ui-tokens` e `p3-7a` sono già unite: i token semantici esistono e i fogli di stile non usano più i gradini grezzi della palette.

Prove visive del gruppo: `/root/.local/state/forge/plans/bookeeper-fase-7b/tasks/d-polish-collection/evidenze/` (schermate e `axe.json` con le violazioni di quelle pagine prima delle correzioni della prima ondata).

# Desktop: scaffali, prestiti, wishlist

## Ambito

Moduli `shelves`, `loans`, `wishlist` del desktop.

Schermate: `/shelves` (con "Dov'è?"), `/loans` (in corso, in ritardo, restituiti), `/wishlist` (mia e di famiglia), e i loro stati vuoti.

## Cosa fare

1. Setup di Impeccable dalla cartella `apps/desktop` (vedi il contratto). Modalità Operate, rifinitura.
2. `/impeccable polish` sul gruppo, con questi rilievi da chiudere (oltre a ciò che il passaggio trova da sé, entro l'ambito):
   - Prestiti: il collegamento della persona dice "A Marco" ma il nome accessibile è "Mostra i prestiti di Marco" (WCAG 2.5.3): il nome comincia con il testo visibile.
   - Wishlist: le etichette di priorità hanno un nome accessibile che non contiene il testo visibile (2.5.3).
   - Scaffali: i dorsi sono un'eccezione dichiarata alla misura dei bersagli; verifica che ogni azione del dorso sia raggiungibile anche dal menu e dalla tastiera.
   - Stati vuoti: "Nessun prestito restituito", wishlist vuota, nessun mobile: ognuno spiega e offre l'azione successiva, con lo stesso tono degli altri.
3. `/impeccable harden` sul gruppo: stati vuoti, d'errore e di caricamento; testi lunghi e nomi lunghi; permessi (ospite, membro); tastiera. Un errore dice cosa è successo e come rimediare, non solo "Qualcosa non ha funzionato".
4. `/impeccable clarify` solo dove i rilievi parlano di testi.
5. Nel rapporto: cosa hai cambiato per ogni rilievo, cosa hai trovato in più e cosa hai lasciato com'è e perché.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/shelves/`, `loans/`, `wishlist/`, e i file i18n `shelves`, `loans`, `wishlist` (it e en).
