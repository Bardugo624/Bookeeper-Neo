Leggi prima `docs/forge/fase-7b/CONTRATTO.md`, `docs/forge/fase-7b/AUDIT.md`, `PRODUCT.md` e `DESIGN.md`. Le task `people-cache`, `ui-tokens` e `p3-7a` sono già unite: i token semantici esistono e i fogli di stile non usano più i gradini grezzi della palette.

Prove visive del gruppo: `/root/.local/state/forge/plans/bookeeper-fase-7b/tasks/m-polish-search/evidenze/` (schermate e `axe.json` con le violazioni di quelle pagine prima delle correzioni della prima ondata).

# PWA: ricerca, scheda, lettura, tag

## Ambito

Moduli `search`, `reading`, `tags` della PWA.

Schermate: `/search` (con i filtri), `/books/:id`, `/books/:id/edit`, `/books/:id/where`.

## Cosa fare

1. Setup di Impeccable dalla cartella `apps/mobile` (vedi il contratto). Modalità Operate, rifinitura.
2. `/impeccable polish` sul gruppo, con questi rilievi da chiudere (oltre a ciò che il passaggio trova da sé, entro l'ambito):
   - "Dove si trova": la frase "Libreria grande · ripiano 1 · posto 1" va a capo lasciando "1" da solo. Spazi non divisibili tra etichetta e numero, `text-wrap: pretty`.
   - Filtri rapidi: la striscia scorre in orizzontale ma "Non collocati" appare troncato sotto "Filtri". Una sfumatura al bordo quando c'è altro da scorrere.
   - Righe della ricerca: il nome accessibile non contiene il testo visibile (2.5.3).
   - Blocco "Dove si trova" nel tema scuro (era bianco su bianco): verifica dopo i token.
3. `/impeccable harden` sul gruppo: stati vuoti, d'errore e di caricamento; testi lunghi e nomi lunghi; permessi (ospite, membro); tastiera. Un errore dice cosa è successo e come rimediare, non solo "Qualcosa non ha funzionato".
4. `/impeccable clarify` solo dove i rilievi parlano di testi.
5. Nel rapporto: cosa hai cambiato per ogni rilievo, cosa hai trovato in più e cosa hai lasciato com'è e perché.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- A 320px nessuno scorrimento orizzontale; bersagli ≥ 44×44px; campi con testo ≥ 16px.
- Cambiano solo file sotto `apps/mobile/src/modules/search/`, `reading/`, `tags/`, e i file i18n `msearch`, `mreading`, `mtags` (it e en).
