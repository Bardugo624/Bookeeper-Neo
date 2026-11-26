Leggi prima `docs/forge/fase-7b/CONTRATTO.md`, `docs/forge/fase-7b/AUDIT.md`, `PRODUCT.md` e `DESIGN.md`. Le task `people-cache`, `ui-tokens` e `p3-7a` sono già unite: i token semantici esistono e i fogli di stile non usano più i gradini grezzi della palette.

Prove visive del gruppo: `/root/.local/state/forge/plans/bookeeper-fase-7b/tasks/d-polish-people/evidenze/` (schermate e `axe.json` con le violazioni di quelle pagine prima delle correzioni della prima ondata).

# Desktop: persone, dispositivi, statistiche

## Ambito

Moduli `people`, `devices`, `stats` del desktop.

Schermate: `/people` (con l'invito), `/devices`, `/stats` (libreria e lettura), statistiche vuote. Nota: le schermate di `/people` mostrano l'errore corretto da `people-cache`; giudica la pagina dal codice e dai test.

## Cosa fare

1. Setup di Impeccable dalla cartella `apps/desktop` (vedi il contratto). Modalità Operate, rifinitura.
2. `/impeccable polish` sul gruppo, con questi rilievi da chiudere (oltre a ciò che il passaggio trova da sé, entro l'ambito):
   - Persone: righe, ruoli, inviti in attesa, dialoghi (ruolo, rinomina, rimozione, cambio proprietario, invito).
   - Statistiche: barre per mese, calendario di lettura e schede numeriche nei due temi (contrasto delle barre e delle etichette ≥ 3:1 per gli elementi grafici).
   - Dispositivi: elenco e dialogo di abbinamento.
3. `/impeccable harden` sul gruppo: stati vuoti, d'errore e di caricamento; testi lunghi e nomi lunghi; permessi (ospite, membro); tastiera. Un errore dice cosa è successo e come rimediare, non solo "Qualcosa non ha funzionato".
4. `/impeccable clarify` solo dove i rilievi parlano di testi.
5. Nel rapporto: cosa hai cambiato per ogni rilievo, cosa hai trovato in più e cosa hai lasciato com'è e perché.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/people/`, `devices/`, `stats/`, e i file i18n `people`, `devices`, `stats` (it e en).
