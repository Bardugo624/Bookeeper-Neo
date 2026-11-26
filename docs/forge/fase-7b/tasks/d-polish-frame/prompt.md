Leggi prima `docs/forge/fase-7b/CONTRATTO.md`, `docs/forge/fase-7b/AUDIT.md`, `PRODUCT.md` e `DESIGN.md`. Le task `people-cache`, `ui-tokens` e `p3-7a` sono già unite: i token semantici esistono e i fogli di stile non usano più i gradini grezzi della palette.

Prove visive del gruppo: `/root/.local/state/forge/plans/bookeeper-fase-7b/tasks/d-polish-frame/evidenze/` (schermate e `axe.json` con le violazioni di quelle pagine prima delle correzioni della prima ondata).

# Desktop: cornice, ingresso e impostazioni

## Ambito

Barra laterale e cornice (`apps/desktop/src/shell`), componenti condivisi del desktop (`apps/desktop/src/kit`), palette dei comandi, percorso di ingresso (`welcome`), primo libro (`onboarding`), aggiornamenti (`updates`), Impostazioni con tutte le sezioni (`settings`).

Schermate: barra laterale su ogni pagina, palette (`Ctrl K`), `/welcome` (tre percorsi), libreria vuota (suggerimento del primo libro), `/settings/*`.

## Cosa fare

1. Setup di Impeccable dalla cartella `apps/desktop` (vedi il contratto). Modalità Operate, rifinitura.
2. `/impeccable polish` sul gruppo, con questi rilievi da chiudere (oltre a ciò che il passaggio trova da sé, entro l'ambito):
   - Nella barra laterale "Cerca o lancia un comando" va su due righe accanto a `Ctrl K`: una riga sola, con un testo che dice la stessa cosa.
   - Voce selezionata del menu delle Impostazioni nel tema scuro: verificare che dopo i token sia leggibile e coerente con la voce selezionata della barra laterale.
   - Stato d'errore condiviso ("Qualcosa non ha funzionato"): dice cosa non ha funzionato quando lo sa, e offre l'azione giusta.
   - Percorso di ingresso: gerarchia dei tre percorsi, campi e messaggi d'errore.
3. `/impeccable harden` sul gruppo: stati vuoti, d'errore e di caricamento; testi lunghi e nomi lunghi; permessi (ospite, membro); tastiera. Un errore dice cosa è successo e come rimediare, non solo "Qualcosa non ha funzionato".
4. `/impeccable clarify` solo dove i rilievi parlano di testi.
5. Nel rapporto: cosa hai cambiato per ogni rilievo, cosa hai trovato in più e cosa hai lasciato com'è e perché.

## Correzioni dalla prima revisione

Il piano non dichiarava la pagina d'errore condivisa: ora `apps/desktop/src/app/RouteError.tsx` e `apps/desktop/src/app/routes.tsx` sono tra i tuoi file.

1. **[P2]** `ErrorState` nuovo non è usato da nessuno: l'elemento d'errore del router (`app/routes.tsx`) mostra ancora `RouteError`, sempre con "Qualcosa non ha funzionato" e Riprova. Regola: la pagina d'errore del router usa `ErrorState` e dice cosa non ha funzionato quando l'errore lo dice (permesso negato, rete assente, sessione scaduta), con l'azione giusta per ciascuno.
2. **[P3]** `welcome.errors.generic` dice "controlla che il server sia acceso" anche quando si crea una libreria locale, dove il server non c'è (`useCreateLocal.ts` → `apiErrors`). Regola: un testo per gli errori senza server e uno per quelli con il server.
3. **[P3]** `ErrorState` per `unauthorized` dice "Esci e accedi di nuovo", ma offre solo Riprova, che fallirebbe di nuovo. Regola: con `unauthorized` l'azione è uscire (come "Esci" nell'account).
4. **[P3]** Registro attività con errore sconosciuto: il messaggio si ripete ("Non è stato possibile caricare il registro. Qualcosa è andato storto. Riprova." più il bottone Riprova). Regola: una frase sola, poi il bottone.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/shell/`, `apps/desktop/src/kit/`, `apps/desktop/src/app/RouteError.tsx`, `apps/desktop/src/app/routes.tsx`, `apps/desktop/src/modules/palette/`, `welcome/`, `onboarding/`, `updates/`, `settings/`, e i file i18n `shell`, `palette`, `welcome`, `onboarding`, `updates`, `settings`, `backup`, `transfer`, `sharing`, `audit`, `notifications`, `common`, `status`, `app` (it e en).
