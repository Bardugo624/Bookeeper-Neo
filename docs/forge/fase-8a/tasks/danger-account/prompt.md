Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Zona pericolosa»), `PRODUCT.md` e `DESIGN.md` (sezione «Zona pericolosa»). Sono già unite `kit-danger-zone` (`DangerZone`, `DangerAction`, `Dialog` con `tone="danger"`, `ConfirmDialog` col tono) e `kit-danger-tones` (`Button` e `IconButton` con `tone="danger"`, voci pericolose in fondo ai menu), e le task del tour.

# Desktop: zona pericolosa in impostazioni, persone, dispositivi

## Cosa

Applica la regola della zona pericolosa a queste superfici. Setup di Impeccable da `apps/desktop` con `--target src/modules/settings`; leggi `reference/harden.md` e `reference/craft-floor.md`. Comportamento, conferme e permessi restano com'erano: cambia dove stanno le azioni e come si vedono, e ogni azione dice la sua conseguenza.

1. **Impostazioni → Backup**: «Ripristina da file» va in una `DangerZone` in fondo alla sezione. Conseguenza: sostituisce tutti i dati della libreria e non si annulla. La conferma con la parola da scrivere resta, con `tone="danger"`.
2. **Impostazioni → Account**: «Esci da questo dispositivo» va in una `DangerZone` in fondo alla sezione. Conseguenza: per rientrare servono email e password o un nuovo codice di abbinamento.
3. **Impostazioni → Condivisione** (libreria sul computer): se la sezione ha un'azione che spegne la condivisione o scollega gli altri dispositivi, va in una `DangerZone` in fondo, con la conseguenza. Se non ce n'è, nulla.
4. **Persone**: per la persona che usa l'app, «Esci dalla libreria» (chi non è proprietario) e «Trasferisci la proprietà» (proprietario) vanno in una `DangerZone` in fondo alla pagina, con la conseguenza. «Rimuovi» resta nel menu di ogni persona: il kit la mette in fondo, in rosso. `ConsequencesDialog`, quando la conseguenza è distruttiva, usa `tone="danger"`.
5. **Dispositivi**: «Revoca» su ogni scheda di dispositivo diventa un bottone con `tone="danger"`, staccato dalle altre azioni della scheda; la conferma usa `tone="danger"`.
6. **Benvenuto**: «Dimentica questa libreria» (`modules/welcome/ForgetDialog.tsx`) usa `tone="danger"`.
7. Testi: il titolo «Zona pericolosa» e le conseguenze nei file i18n dei moduli (italiano e inglese).

## Test

- Ogni zona c'è, ha il suo nome, contiene le azioni giuste e solo quelle; le azioni funzionano come prima (stesse conferme, stessi permessi: chi non può non vede l'azione).
- Le conferme distruttive hanno il tono `danger`; «Revoca» e «Rimuovi» si riconoscono come pericolose.
- I test esistenti dei moduli toccati passano, aggiornati dove cercano le azioni nel posto vecchio.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/settings src/modules/people src/modules/devices src/modules/welcome` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/settings/sections/backup/`, `sections/account/`, `sections/sharing/`, `modules/people/`, `modules/devices/`, `modules/welcome/ForgetDialog.tsx` (e il suo test), e i file i18n `settings`, `sharing`, `people`, `devices`, `welcome` (it, en).
