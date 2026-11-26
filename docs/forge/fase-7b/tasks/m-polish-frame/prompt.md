Leggi prima `docs/forge/fase-7b/CONTRATTO.md`, `docs/forge/fase-7b/AUDIT.md`, `PRODUCT.md` e `DESIGN.md`. Le task `people-cache`, `ui-tokens` e `p3-7a` sono già unite: i token semantici esistono e i fogli di stile non usano più i gradini grezzi della palette.

Prove visive del gruppo: `/root/.local/state/forge/plans/bookeeper-fase-7b/tasks/m-polish-frame/evidenze/` (schermate e `axe.json` con le violazioni di quelle pagine prima delle correzioni della prima ondata).

# PWA: cornice, abbinamento, account, scansione

## Ambito

Cornice e barra delle schede (`apps/mobile/src/shell`), componenti condivisi (`apps/mobile/src/kit`), `app`, moduli `pair`, `account`, `scan`.

Schermate: `/pair` (introduzione e collegamento), `/account`, `/scan` (fotocamera non disponibile, scrittura a mano, fogli dei risultati), `/scan/shelf`.

## Cosa fare

1. Setup di Impeccable dalla cartella `apps/mobile` (vedi il contratto). Modalità Operate, rifinitura.
2. `/impeccable polish` sul gruppo, con questi rilievi da chiudere (oltre a ciò che il passaggio trova da sé, entro l'ambito):
   - Scansione: l'icona di "Fotocamera non disponibile" sta in un riquadro che nel tema scuro era bianco; verifica dopo i token e rendi coerenti icona, titolo e azioni.
   - "Riempi un ripiano" e "Scrivi l'ISBN a mano": gerarchia tra azione principale e secondarie.
   - Abbinamento: la pagina di introduzione ha molto vuoto tra i passi e il bottone; ritmo verticale.
   - Account: sezioni, righe e scelta del tema.
3. `/impeccable harden` sul gruppo: stati vuoti, d'errore e di caricamento; testi lunghi e nomi lunghi; permessi (ospite, membro); tastiera. Un errore dice cosa è successo e come rimediare, non solo "Qualcosa non ha funzionato".
4. `/impeccable clarify` solo dove i rilievi parlano di testi.
5. Nel rapporto: cosa hai cambiato per ogni rilievo, cosa hai trovato in più e cosa hai lasciato com'è e perché.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- A 320px nessuno scorrimento orizzontale; bersagli ≥ 44×44px; campi con testo ≥ 16px.
- Cambiano solo file sotto `apps/mobile/src/shell/`, `apps/mobile/src/kit/`, `apps/mobile/src/app/`, `apps/mobile/src/modules/pair/`, `account/`, `scan/`, e i file i18n `mobile`, `mpair`, `maccount`, `mscan` (it e en).
