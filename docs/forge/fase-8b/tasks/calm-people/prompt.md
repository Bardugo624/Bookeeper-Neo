Leggi prima `docs/forge/fase-8b/CONTRATTO.md`, `docs/forge/fase-8b/request.md` e la sezione «Zona pericolosa» di `DESIGN.md`.

# Persone e dispositivi: niente zona fissa, il rosso nella conferma

1. **Persone** (`modules/people/`): togli la `DangerZone` in fondo alla pagina. «Esci dalla libreria» (nel menu della propria riga) e «Rendi proprietario» (nel menu delle altre persone) restano dove erano nella 2.0.0; «Rimuovi» resta nel menu, che il kit mette in fondo. `ConsequencesDialog` resta rossa (`tone="danger"`) quando la conseguenza è distruttiva.
2. **Dispositivi** (`modules/devices/DeviceCard.tsx`): «Revoca» torna com'era nella 2.0.0, neutro; la conferma è rossa e dice la conseguenza.
3. Togli i testi rimasti senza uso in `people.json` e `devices.json` (it, en).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/people src/modules/devices src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Test: nessuna zona nelle Persone; le azioni nei menu giusti per ruolo; «Revoca» neutro e conferma rossa.
- Cambiano solo file sotto `apps/desktop/src/modules/people/`, `apps/desktop/src/modules/devices/`, e `people.json`, `devices.json` (it, en).
