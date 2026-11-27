Leggi prima `docs/forge/fase-9c/CONTRATTO.md` («La misura», «Il mazzo», «Interfacce fra le task», «Regole») e il design `docs/superpowers/specs/2026-11-27-pagina-apertura-design.md` («Il componente», «La scelta della citazione»). Per la composizione guarda gli schizzi `docs/superpowers/specs/2026-11-27-pagina-apertura/` e il frontespizio del Setup di oggi, `apps/setup/src/shell/Frontispiece.tsx` e `Frontispiece.module.css`.

# `@bookeeper/ui/quote`: dati, misura, mazzo e componente

## File
- Crea in `packages/ui/src/quote/`:
  - `index.ts`;
  - `data.ts`, con `QUOTES`, `quotesIn` e `quoteText`;
  - `size.ts`, con `quoteSize`;
  - `deck.ts`, con `nextQuote`;
  - `useOpeningQuote.ts`;
  - `Quotation.tsx` e `Quotation.module.css`;
  - i loro test.
- Non modificare `quotes.json`: lo scrive `node scripts/quotes.mjs`.
- Modifica `packages/ui/package.json`: export `"./quote": "./src/quote/index.ts"`.
- Modifica `packages/ui/tsconfig.json`: `"resolveJsonModule": true`.

## Interfacce consumate
`packages/ui/src/quote/quotes.json` della task `quote-data`, con la forma del contratto.

## Interfacce prodotte
Esattamente quelle del contratto, «`@bookeeper/ui/quote`». Le usano `quote-setup` e `welcome-panel`.

## Cosa fare
- **`quoteSize`:** la regola del contratto, con il fattore 0,55 per carattere sul verso più lungo, in code point.
- **`nextQuote`:**
  - il mazzo del contratto, con lo stato in `bookeeper.quotes.<lingua>`;
  - la memoria predefinita è `globalThis.localStorage`, letta dentro un `try`;
  - `random` predefinito è `Math.random`;
  - mescola con Fisher–Yates.
- **`useOpeningQuote(lang)`:**
  - la voce si sceglie una volta, nell'inizializzatore di `useState`;
  - se `lang` cambia e la voce non ha testo nella lingua nuova, prende la carta successiva di quella lingua;
  - un nuovo montaggio prende la carta successiva.
- **`Quotation`:** la composizione del frontespizio del Setup, ora condivisa.
  - Lora 500, interlinea 1,24, `text-wrap: balance`, `--bk-text-strong`.
  - Caporali in `--bk-accent-text`, `aria-hidden="true"`, il primo appeso nel margine come nel Setup.
  - Una riga a blocco per ogni riga del testo; una riga troppo lunga per la colonna continua rientrata di 1 em.
  - Didascalia in Inter 13 `--bk-text-muted`, l'opera in `cite` Lora corsivo 14; senza opera, il solo autore, senza « · ».
  - La classe esterna arriva da `className`: la cornice e la colonna le decide chi usa il componente.

## Test
- **`quoteSize`:** i casi del contratto, «Cose che più facilmente farebbero male», punto 3.
- **`quotesIn` e `quoteText`:**
  - nessuna voce con `en: null` in `quotesIn('en')`; 80 voci in italiano e 48 in inglese;
  - `quoteText` di un `id` che non esiste dà `null`.
- **`nextQuote`,** con una memoria finta e `random` fisso:
  - un giro intero senza ripetizioni, che copre tutto il gruppo;
  - la prima carta del giro nuovo non è l'ultima uscita;
  - `getItem` o `setItem` che lanciano un errore, JSON non valido, un `id` che non esiste più, un `id` nuovo che manca, `next` fuori: la funzione restituisce sempre una voce della lingua giusta, senza errori;
  - con `storage: null` funziona lo stesso;
  - i mazzi delle due lingue sono separati.
- **`useOpeningQuote`:** la voce resta uguale fra un rendering e l'altro, e un nuovo montaggio prende la successiva.
- **`Quotation`:**
  - un elemento per riga con la classe del rientro;
  - i caporali sono nascosti ai lettori di schermo;
  - didascalia con e senza opera;
  - `font-size` uguale a `size`.
- **Stile:** il test di stile di `packages/ui` passa: nessun colore letterale, movimento solo dentro `no-preference`.

## Acceptance criteria
- `npm test -w @bookeeper/ui` e `npm run typecheck -w @bookeeper/ui` passano.
- `impeccable detect --json packages/ui/src/quote` è pulito.
- Cambiano solo i file dichiarati.
