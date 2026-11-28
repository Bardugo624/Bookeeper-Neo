Leggi prima `docs/forge/fase-10b2/CONTRATTO.md` e la revisione finale in `docs/forge/fase-10b2/REVISIONE.md`.

# Lettore: il tema anche nelle finestrelle e nei fogli

## File
`packages/reader/src/app/ReaderScreen.tsx` e un nuovo `useDocumentTheme.ts` con il suo test; `packages/reader/src/ui/view/Sheet.tsx` e `Sheet.css`; `packages/reader/src/model/themes.ts` con il suo test.

## Cosa fare
- `themes.ts` riceve `overlayVars(theme)`: le variabili del kit del contratto, ricavate da `THEME_COLORS`.
- `useDocumentTheme(theme)`, chiamato da `ReaderScreen`, le mette su `document.documentElement` insieme a `themeVars(theme)` mentre il lettore è aperto, e le toglie all'uscita, rimettendo i valori di prima.
- Il risultato (catture `desktop-10-tema-scuro`, `desktop-10-tema-nero`, `mobile-07`):
  - su Scuro e Nero la finestrella Aspetto, i fogli, il menu e l'editor della nota hanno la superficie scura del tema, come nello schizzo `04`;
  - sul telefono le schede del pannello stanno su un binario, i filtri hanno il bordo, «Tutte» è pieno d'accento, «Esporta in Markdown» è un pulsante con il bordo, come negli schizzi `02` e `07`.

## Test
- `overlay_vars_follow_the_theme`: in Scuro `--bk-surface-raised` è la superficie scura.
- `reader_sets_and_restores_the_theme_on_the_document`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- Guardato in Chromium nella build di produzione: la finestrella Aspetto su Scuro è scura; il foglio delle note sul telefono ha i filtri con il bordo e il pulsante.
