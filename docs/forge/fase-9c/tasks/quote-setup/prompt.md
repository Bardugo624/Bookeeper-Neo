Leggi prima `docs/forge/fase-9c/CONTRATTO.md` («Interfacce fra le task», sezione «Setup»; «Regole») e il design `docs/superpowers/specs/2026-11-27-pagina-apertura-design.md` («La scelta della citazione»). Il brief del Setup è `apps/setup/.impeccable/surfaces/src-main-tsx.md`.

# Setup: i dati e la composizione condivisi

## File
- Modifica in `apps/setup/src/shell/`:
  - `quotes.ts` e `quotes.test.tsx`;
  - `Frontispiece.tsx`, `Frontispiece.module.css` e `Frontispiece.test.tsx`;
  - `index.ts`;
  - `SetupLayout.tsx` e `BlockedPanel.tsx`, solo se il tipo di `ShownQuote` li tocca.
- Modifica i test di `apps/setup/src/install` e `apps/setup/src/uninstall` che si appoggiano ai vecchi dati, e il codice solo dove il tipo nuovo lo richiede.
- Togli `apps/setup/src/quotes.json`, `scripts/setup/quotes.mjs` e `scripts/setup/quotes.test.mjs`.

## Interfacce consumate
`@bookeeper/ui/quote` della task `quote-ui`: `QUOTES`, `quoteText`, `quoteSize`, `Quotation` e i tipi.

## Cosa fare
- **`quotes.ts`:**
  - i gruppi del Setup si costruiscono su `QUOTES`, saltando i testi `null` nella lingua mostrata;
  - le regole di lunghezza restano: benvenuto e congedo fino a 110 caratteri e al massimo 2 righe, avanzamento fino a 200;
  - `resolveQuote` restituisce `null` quando la citazione non ha testo nella lingua;
  - `innerQuotes` sparisce, perché i dati arrivano già composti.
- **`Frontispiece`:**
  - usa `Quotation` dentro la sua cornice, con `quoteSize(text, { columnPx: 600, compact })`;
  - la compattazione con FLIP, i margini e il movimento di oggi restano come sono;
  - con `null` non disegna niente, come oggi.
- **Gli schermi del Setup restano uguali:** stesse misure, stessi caporali appesi, stessa didascalia.

## Test
- Il test che legge `../quotes.json` passa a `@bookeeper/ui/quote`.
- **Gruppi:**
  - in inglese nessuna voce con `en: null`;
  - benvenuto e congedo hanno 34 voci in italiano e 21 in inglese, contate sui testi già composti;
  - l'avanzamento ha 69 voci in italiano e 44 in inglese;
  - nessuna voce oltre i limiti.
- **`resolveQuote`:** `null` per una citazione senza testo inglese, quando la lingua è `en`.
- **`Frontispiece`:**
  - la didascalia senza opera, per esempio `stephane-mallarme-1`;
  - le righe dei versi, per esempio `dante-alighieri-2` in italiano;
  - il `font-size` atteso, compatto e no.
- Tutti i test del Setup di oggi passano, aggiornati solo dove leggevano i dati vecchi.

## Acceptance criteria
- `npm test -w @bookeeper/setup` e `npm run typecheck -w @bookeeper/setup` passano.
- `npm run test:scripts` resta verde senza `scripts/setup/quotes.test.mjs`.
- `impeccable detect --json apps/setup/src/shell` è pulito.
- Cambiano solo i file dichiarati.
