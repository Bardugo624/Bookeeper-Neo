Leggi prima `docs/forge/fase-10b2/CONTRATTO.md` e la revisione finale in `docs/forge/fase-10b2/REVISIONE.md`.

# Telefono: offline sotto «Leggi» e passi per l'iPhone

## File
`apps/mobile/src/modules/search/`, `apps/mobile/src/modules/reader/InstallSheet.tsx` con il suo CSS, e `offline.test.tsx`; `packages/ui/src/base/Icon.tsx` con il suo test; i testi in `packages/i18n/src/locales/it/mreader.json` e `en/mreader.json`.

## Cosa fare
- **«Scarica per leggere offline» sotto «Leggi»** (cattura `mobile-02` contro lo schizzo `08`, a sinistra): il controllo offline, oggi in `BookFiles.tsx`, va subito sotto «Leggi», con «EPUB · 2,4 MB» sotto. Nel blocco dei file non si ripete.
- **Passi per l'iPhone** (cattura `mobile-03` contro lo schizzo `08`, al centro):
  - nei passi 1 e 2, in linea, l'icona di condivisione e quella di aggiunta. Il kit non le ha: `Icon` riceve i nomi `share` e `square-plus` (lucide `Share` e `SquarePlus`);
  - «Condividi» e «Aggiungi alla schermata Home» in grassetto, in italiano e in inglese;
  - «Ho capito» alla misura normale del pulsante del kit.

## Test
- `offline_control_sits_under_read`.
- `install_steps_show_the_icons_and_the_bold_names`.

## Acceptance criteria
- `npx vitest run src/modules/search src/modules/reader` (da `apps/mobile`) e `npm run typecheck -w @bookeeper/mobile` passano.
