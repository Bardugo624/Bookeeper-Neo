Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Zona pericolosa»), `PRODUCT.md` e `DESIGN.md` (sezione «Zona pericolosa»). Sono già unite `kit-danger-zone` (`DangerZone`, `DangerAction`, `Dialog` con `tone="danger"`, `ConfirmDialog` col tono) e `kit-danger-tones` (`Button` e `IconButton` con `tone="danger"`, voci pericolose in fondo ai menu), e le task del tour.

# Desktop: zona pericolosa in persone, dispositivi e benvenuto

## Cosa

Applica la regola della zona pericolosa a queste superfici. Setup di Impeccable da `apps/desktop` con `--target src/modules/people`; leggi `reference/harden.md` e `reference/craft-floor.md`. Comportamento, conferme e permessi restano com'erano: cambia dove stanno le azioni e come si vedono, e ogni azione dice la sua conseguenza.

1. **Persone**: per la persona che usa l'app, «Esci dalla libreria» (chi non è proprietario) e «Trasferisci la proprietà» (proprietario) vanno in una `DangerZone` in fondo alla pagina, con la conseguenza. «Rimuovi» resta nel menu di ogni persona: il kit la mette in fondo, in rosso. `ConsequencesDialog`, quando la conseguenza è distruttiva, usa `tone="danger"`.
2. **Dispositivi**: «Revoca» su ogni scheda di dispositivo diventa un bottone con `tone="danger"`, staccato dalle altre azioni della scheda; la conferma usa `tone="danger"`.
3. **Benvenuto**: «Dimentica questa libreria» (`modules/welcome/ForgetDialog.tsx`) usa `tone="danger"`.
4. Testi: «Zona pericolosa» e le conseguenze in `people.json`, `devices.json`, `welcome.json` (italiano e inglese).

## Test

- La zona delle Persone c'è, ha il suo nome e contiene le azioni giuste per il ruolo (il proprietario non vede «Esci», chi non è proprietario non vede «Trasferisci»); funzionano come prima.
- «Revoca» e «Rimuovi» si riconoscono come pericolose; le conferme distruttive e «Dimentica questa libreria» hanno il tono `danger`.
- I test esistenti dei moduli toccati passano, aggiornati dove cercano le azioni nel posto vecchio.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/people src/modules/devices src/modules/welcome` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/people/`, `devices/`, `welcome/`, e `people.json`, `devices.json`, `welcome.json` (it, en).
