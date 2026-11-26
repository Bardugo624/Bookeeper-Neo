Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Zona pericolosa»), `PRODUCT.md` e `DESIGN.md` (sezione «Zona pericolosa»). Sono già unite `kit-danger-zone` (`DangerZone`, `DangerAction`, `Dialog` con `tone="danger"`, `ConfirmDialog` col tono) e `kit-danger-tones` (`Button` e `IconButton` con `tone="danger"`, voci pericolose in fondo ai menu), e le task del tour.

# Desktop: zona pericolosa nelle impostazioni

## Cosa

Applica la regola della zona pericolosa alle impostazioni. Setup di Impeccable da `apps/desktop` con `--target src/modules/settings`; leggi `reference/harden.md` e `reference/craft-floor.md`. Comportamento, conferme e permessi restano com'erano: cambia dove stanno le azioni e come si vedono, e ogni azione dice la sua conseguenza.

1. **Backup**: «Ripristina da file» va in una `DangerZone` in fondo alla sezione. Conseguenza: sostituisce tutti i dati della libreria e non si annulla. La conferma con la parola da scrivere resta, con `tone="danger"`.
2. **Account**: «Esci da questo dispositivo» va in una `DangerZone` in fondo alla sezione. Conseguenza: per rientrare servono email e password o un nuovo codice di abbinamento.
3. **Condivisione** (libreria sul computer): se la sezione ha un'azione che spegne la condivisione o scollega gli altri dispositivi, va in una `DangerZone` in fondo, con la conseguenza. Se non ce n'è, nulla.
4. Testi: il titolo «Zona pericolosa» e le conseguenze in `settings.json` e `sharing.json` (italiano e inglese).

## Test

- Ogni zona c'è, ha il suo nome, contiene le azioni giuste e solo quelle; le azioni funzionano come prima (stesse conferme, stessi permessi: chi non può non vede l'azione).
- Le conferme distruttive hanno il tono `danger`.
- I test esistenti delle impostazioni passano, aggiornati dove cercano le azioni nel posto vecchio.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/kit/styles.test.ts` (da `apps/desktop`) passa: i fogli di stile usano solo token esistenti; `npx vitest run src/modules/settings` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/settings/sections/backup/`, `sections/account/`, `sections/sharing/`, i test delle impostazioni in `apps/desktop/src/modules/settings/` che le riguardano, e `settings.json`, `sharing.json` (it, en).
