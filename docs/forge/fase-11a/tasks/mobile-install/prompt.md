Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Telefono: il foglio dell'iPhone, ultimo ritocco

## File
`apps/mobile/src/modules/reader/InstallSheet.tsx` con il suo CSS e `offline.test.tsx`; i testi in `packages/i18n/src/locales/it/mreader.json` e `en/mreader.json`.

## Cosa fare
Correzione 5 della terza revisione:
- restano insieme solo l'icona e la prima parola («[+] **Aggiungi**»), il resto del nome va a capo da solo, così la prima riga legge «Scegli [+] Aggiungi alla»;
- il titolo sta su due righe a 390 px;
- a 320 px niente esce dal foglio;
- «Ho capito» a 17 px come «Leggi»;
- niente `--bk-radius-md`, `--bk-font-sans` o `--bk-surface-inset`.

## Test
- `only_the_icon_and_the_first_word_stay_together`.

## Acceptance criteria
- Da `apps/mobile`: `npx vitest run src/modules/reader` e `npm run typecheck -w @bookeeper/mobile` passano.
- Guardato in Chromium a 390×844 e a 320×640.
