Leggi prima `docs/forge/fase-9c/CONTRATTO.md` («La pagina d'apertura», «Interfacce fra le task», «Regole»), il design `docs/superpowers/specs/2026-11-27-pagina-apertura-design.md` («La pagina d'apertura») e il brief `apps/desktop/.impeccable/surfaces/src-modules-welcome-welcomeview-tsx.md`. Gli schizzi approvati, `docs/superpowers/specs/2026-11-27-pagina-apertura/01`…`05`, sono la composizione da ottenere.

# App desktop: il frontespizio della pagina d'apertura

## File
- Modifica in `apps/desktop/src/modules/welcome/`:
  - `BrandPanel.tsx`;
  - `WelcomeView.tsx` e `WelcomeView.module.css`;
  - `welcome.test.tsx`.
- Crea `apps/desktop/src/modules/welcome/mark.png`, copia esatta di `apps/setup/src/shell/mark.png`.
- Modifica `packages/i18n/src/locales/it/welcome.json` e `en/welcome.json`: togli `welcome.hero.title` e `welcome.hero.cover1` … `cover4`.

## Interfacce consumate
`@bookeeper/ui/quote` della task `quote-ui`: `useOpeningQuote`, `Quotation`, `quoteSize`. La lingua dell'app viene da `useLocale()` di `apps/desktop/src/app/i18n.tsx`.

## Cosa fare
- **`BrandPanel`,** tutto dentro il pannello di 440 px:
  - in alto il marchio, cioè l'icona e `welcome.brand.label`;
  - al centro `Quotation`, con la voce di `useOpeningQuote(useLocale())` nella lingua dell'app e la misura `quoteSize(text, { columnPx: 348 })`;
  - in fondo `welcome.hero.text`;
  - valori e movimento come in «La pagina d'apertura» del contratto.
- **Copertine:** `BookCover` e le quattro copertine escono.
- **`WelcomeView`:** `welcome.heading` e `welcome.subheading` solo senza una libreria salvata. Per chi torna, sopra «Bentornato in …» non c'è niente, anche quando apre «Usa un'altra libreria».
- **La parte destra** resta com'è in tutto il resto.
- **Movimento:** `animation: global(bk-rise) var(--bk-dur-slow) var(--bk-ease)` sulla citazione, dentro `@media (prefers-reduced-motion: no-preference)`.

## Test
In `welcome.test.tsx`:

- **Al primo avvio:**
  - il pannello mostra una citazione presa da `quotesIn(lingua)`, con autore ed eventuale opera;
  - la promessa è presente;
  - non c'è nessuna copertina;
  - c'è il titolo «Come vuoi iniziare?».
- **Con una libreria salvata:** c'è «Bentornato in Casa Rossi», e non ci sono né «Come vuoi iniziare?» né il suo sottotitolo, anche dopo «Usa un'altra libreria».
- **La citazione resta la stessa:**
  - scrivendo in un campo;
  - aprendo un'altra strada;
  - dopo un accesso fallito.
- **Un nuovo montaggio** della pagina mostra la carta successiva del mazzo, con un `localStorage` di prova.
- **In inglese** (`locale="en"`) la citazione è un testo inglese verificato.
- **Stile:** i test di stile dell'app passano (`src/kit/styles.test.ts`): nessun colore letterale, keyframes raggiungibili, movimento solo dentro `no-preference`.

## Acceptance criteria
- `npm test -w @bookeeper/desktop`, `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/i18n` passano.
- `impeccable detect --json apps/desktop/src/modules/welcome` è pulito.
- Cambiano solo i file dichiarati.
