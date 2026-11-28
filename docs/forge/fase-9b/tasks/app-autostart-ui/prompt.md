Leggi prima `docs/forge/fase-9b/CONTRATTO.md`, il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Apertura all'accesso»), `DESIGN.md` e `PRODUCT.md`. La task `app-autostart` è già unita: ci sono i comandi `autostart_get` e `autostart_set`.

# App desktop: la scelta «All'accesso» nelle Impostazioni

## File
- Modifica `apps/desktop/src/platform/`, con i test.
- Modifica `apps/desktop/src/modules/settings/sections/sharing/`: crea `AutostartBlock.tsx` e il suo test, e inseriscilo in `SharingSection.tsx`.
- Modifica `packages/i18n/src/locales/it/sharing.json` e `en/sharing.json`.

## Interfacce
- In `Platform`, `autostart?: { get(): Promise<boolean>; set(on: boolean): Promise<void> }`:
  - presente solo in `tauriPlatform`, che chiama i due comandi;
  - assente in `browserPlatform`.

## Cosa fare
- **Blocco «All'accesso»**, sotto la condivisione, solo con `platform.autostart`:
  - interruttore (casella con `role="switch"`, come quello della condivisione) «Apri Bookeeper all'accesso al computer»;
  - la nota sotto;
  - mentre `set` lavora, l'interruttore è `aria-busy`;
  - un errore mostra `failed` in `--bk-danger-strong` e rimette l'interruttore com'era.
- **Testi** (`sharing.autostart.*`, italiano; l'inglese nello stesso tono):
  - `title` «All'accesso»;
  - `toggle` «Apri Bookeeper all'accesso al computer»;
  - `note` «Si apre ridotto a icona. Se condividi la libreria, i telefoni la trovano finché il computer è acceso.»;
  - `failed` «Non sono riuscito a cambiare l'apertura all'accesso.»
- **Impeccable** in modalità Operate, come dice il contratto: il blocco segue i blocchi vicini della stessa sezione.

## Test (Vitest)
- Il blocco c'è solo con `platform.autostart`.
- Lo stato iniziale arriva da `get`.
- L'interruttore chiama `set`.
- Un errore mostra `failed` e rimette l'interruttore com'era.
- `tauriPlatform.autostart` chiama `autostart_get` e `autostart_set`.

## Acceptance criteria
- `npm run typecheck -w @bookeeper/desktop` e `npx vitest run src/modules/settings src/platform src/kit` (da `apps/desktop`) passano.
- `impeccable detect --json` pulito sui file cambiati.
- Cambiano solo i file dichiarati.
