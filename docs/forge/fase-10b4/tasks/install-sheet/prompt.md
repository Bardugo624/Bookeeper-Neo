Leggi prima `docs/forge/fase-10b4/CONTRATTO.md` e la seconda revisione in `docs/forge/fase-10b4/REVISIONE.md`.

# Telefono: il foglio dell'iPhone come nello schizzo

## File
`apps/mobile/src/modules/reader/InstallSheet.tsx` con il suo CSS e `offline.test.tsx`; `apps/mobile/src/kit/BottomSheet.css`; i testi in `packages/i18n/src/locales/it/mreader.json` e `en/mreader.json`.

## Cosa fare
Cattura `mobile-03-iphone-spiegazione` contro lo schizzo `08`, al centro.
- L'icona sta prima del nome, e icona e nome stanno insieme senza andare a capo: «Tocca [condividi] **Condividi**, in basso.», «Scegli [aggiungi] **Aggiungi alla schermata Home**.»
- A 390 px il titolo sta su due righe, come nello schizzo. I titoli dei fogli si bilanciano (`text-wrap: balance`).
- «Ho capito» è a tutta larghezza, alto 48 px, testo 16 px semibold, come «Leggi» nella scheda del libro.

## Test
- `install_steps_keep_icon_and_name_together`.

## Acceptance criteria
- `npx vitest run src/modules/reader` (da `apps/mobile`) e `npm run typecheck -w @bookeeper/mobile` passano.
- Guardato in Chromium nella build di produzione del telefono a 390×844.
