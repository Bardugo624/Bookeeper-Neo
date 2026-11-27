Leggi prima `docs/forge/fase-9a/CONTRATTO.md`, `docs/forge/fase-9a/request.md` e il design che citano.

# L'app legge gli aggiornamenti da R2

## File

- Modifica `apps/desktop/src-tauri/src/updates.rs`: cambia `DEFAULT_BASE`.
- Modifica `apps/desktop/src-tauri/tests/updates.rs`: aggiungi i test.
- Modifica `apps/desktop/src/modules/settings/settings.test.tsx`: alla riga 171 il numero di versione è scritto a mano.

## Cosa fare

1. `DEFAULT_BASE` diventa `"https://updates.neokeeper.dev/v2"`. `BOOKEEPER_UPDATE_BASE`, al momento della build, continua a sostituirla.
2. `settings.test.tsx` non scrive più la versione a mano (oggi `'2.0.0'`). La prende dalla stessa fonte da cui l'app la mostra; guarda `apps/desktop/src/modules/settings/appVersion.ts` e il test. Così cambiare versione non tocca i test.

## Passi

- [ ] Test in `tests/updates.rs`, prima del codice:
  - `manifest_url(DEFAULT_BASE, Channel::Stable) == "https://updates.neokeeper.dev/v2/stable/latest.json"`;
  - lo stesso per `Channel::Beta` con `/beta/`.
- [ ] Verifica che falliscano, cambia `DEFAULT_BASE` e verifica che passino. I test esistenti di `tests/updates.rs` passano ancora.
- [ ] Cambia `settings.test.tsx` e verifica che passi. Poi prova a mano che passerebbe anche con un'altra versione nel `package.json` dell'app, e rimetti il file com'era.

## Acceptance criteria

- `cargo test -p bookeeper-desktop --test updates` passa.
- `npx vitest run src/modules/settings` (da `apps/desktop`) passa; `npm run typecheck -w @bookeeper/desktop` passa.
- Cambiano solo i tre file dichiarati.
