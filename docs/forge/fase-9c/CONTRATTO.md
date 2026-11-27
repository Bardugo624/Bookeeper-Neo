# Contratto del run 9C: la pagina d'apertura con la citazione

Prima di ogni task leggi:
- il design approvato, `docs/superpowers/specs/2026-11-27-pagina-apertura-design.md`;
- `docs/forge/fase-9c/request.md`;
- per l'interfaccia: il brief `apps/desktop/.impeccable/surfaces/src-modules-welcome-welcomeview-tsx.md`, gli schizzi in `docs/superpowers/specs/2026-11-27-pagina-apertura/`, `DESIGN.md` e `PRODUCT.md`.

Qui ci sono i valori fissati, le interfacce che le task si scambiano e le regole.

## Valori fissati

### Le citazioni

- **Fonti:** `docs/citazioni/citazioni.json` (100 citazioni) e `docs/citazioni/scelte.json` (le scelte del proprietario, campo `choices`).
- **Verificata in una lingua `L`** (`it` o `en`): `confidence === "high"` e `checked[L] === true`.
  - Una citazione con la scelta `scarta` è esclusa in tutte e due le lingue.
  - Le altre scelte, `tieni` compreso, non contano.
  - Una lingua non verificata ha `null`; se tutte e due le lingue sono `null`, la citazione non entra nel file.
- **Generatore:** `node scripts/quotes.mjs` scrive `packages/ui/src/quote/quotes.json`:
  - ordinato per `id`;
  - rientro di due spazi;
  - `\n` in fondo.
- **Forma del file:**

  ```json
  [
    {
      "id": "italo-calvino-1",
      "it": { "text": "I classici sono…", "author": "Italo Calvino", "work": "Perché leggere i classici" },
      "en": { "text": "The classics are…", "author": "Italo Calvino", "work": "Perché leggere i classici" }
    }
  ]
  ```

- **Composizione del testo,** in quest'ordine. Nient'altro cambia:
  1. `'` diventa `’`;
  2. `...` diventa `…`;
  3. `«` diventa `“` e `»` diventa `”`: i caporali esterni li disegna il componente;
  4. ` / ` diventa `\n` (i versi);
  5. ` - ` diventa ` – `, e ` -` in fondo a una riga diventa ` –`.
- **Autore:** è il campo `author`, salvo la tabella `AUTHORS` del generatore:

  | id | it | en |
  |---|---|---|
  | `plinio-il-vecchio-1` | Plinio il Vecchio | Pliny the Elder |
  | `marco-tullio-cicerone-1` | Marco Tullio Cicerone | Cicero |
  | `quinto-orazio-flacco-1` | Quinto Orazio Flacco | Horace |
  | `rene-descartes-1` | Cartesio | René Descartes |
  | `jean-paul-1` | Jean Paul | Jean Paul |

- **Opera:** è il campo `work` fino alla prima ` (`, senza spazi ai lati, salvo la tabella `WORKS` del generatore. Il titolo è quello pubblicato, nella lingua originale, uguale in `it` ed `en`. Valori della tabella:
  - `null`, cioè la didascalia mostra solo l'autore: `samuel-johnson-1`, `samuel-johnson-2`, `john-keats-1`, `plinio-il-vecchio-1`, `stephane-mallarme-1`, `w-somerset-maugham-1`;
  - `dante-alighieri-2`: «Divina Commedia»; `giacomo-leopardi-1`: «Operette morali»; `francis-bacon-1`: «Essays»;
  - `helene-hanff-1`: «84, Charing Cross Road»; `augustine-birrell-1`: «Obiter Dicta»; `charles-lamb-1`: «Last Essays of Elia»;
  - `w-h-auden-1`: «The Dyer's Hand»; `ralph-waldo-emerson-1`: «Society and Solitude»; `robert-louis-stevenson-1`: «Virginibus Puerisque»;
  - `lewis-carroll-1`: «Alice's Adventures in Wonderland»; `charles-dickens-1`: «Our Mutual Friend»;
  - `montesquieu-1`: «Lettres persanes»; `marco-tullio-cicerone-1`: «Epistulae ad familiares»; `quinto-orazio-flacco-1`: «Ars poetica».
- **Didascalie composte:** autore e opera ricevono solo la sostituzione 1 (`'` diventa `’`).

### La misura

`quoteSize(text, { columnPx, compact })`:

- con `compact: true` è sempre 22;
- altrimenti, sulla lunghezza in caratteri (code point): fino a 90 è 33, fino a 140 è 26, oltre è 22;
- se il testo ha `\n` (versi):
  - si prende il primo valore fra 33, 26, 22 e 20, non più grande di quello della lunghezza, per cui `versoPiùLungo × px × 0,55 ≤ columnPx`;
  - se nessuno va bene è 22, e i versi troppo lunghi continuano rientrati.
- Colonne: 348 px nella pagina d'apertura, 600 px nel Setup.

### Il mazzo

- **Chiave in `localStorage`:** `bookeeper.quotes.<lingua>`, con valore `{"order": [id…], "next": n}`.
- `order` è una permutazione degli `id` con un testo in quella lingua. `next` è la prossima carta.
- Se il valore salvato non è valido, non è una permutazione del gruppo di oggi, o `next` è fuori, si rimescola.
- Quando il mazzo finisce se ne mescola uno nuovo. Se la sua prima carta è l'ultima uscita, si scambia con la seconda.
- Se `localStorage` manca o lancia un errore, in lettura o in scrittura, la citazione si sceglie a caso e niente si rompe.

### La pagina d'apertura

- **Pannello:** largo 440 px, fondo `--bk-chrome`. Margini 40 sopra, 44 a destra, 36 sotto, 48 a sinistra.
- **In alto:** l'icona dell'app, 22 px con angoli di 6 px. È la copia di `apps/setup/src/shell/mark.png` in `apps/desktop/src/modules/welcome/mark.png`. Accanto c'è `welcome.brand.label` in Lora 18, peso 600.
- **Al centro:** la citazione, centrata in verticale, in una colonna di 348 px.
- **In fondo:** `welcome.hero.text` in Inter 13, `--bk-text-muted`, larga al massimo 30ch.
- **Movimento:** all'apertura la citazione entra con `animation: global(bk-rise) var(--bk-dur-slow) var(--bk-ease)`, dentro `@media (prefers-reduced-motion: no-preference)`.
- **Titolo della colonna:** `welcome.heading` e `welcome.subheading` si vedono solo quando non c'è una libreria salvata.
- **Testi:** si tolgono `welcome.hero.title` e `welcome.hero.cover1` … `welcome.hero.cover4`, in italiano e in inglese. `welcome.hero.text` e `welcome.brand.label` restano.
- **Sotto i 900 px,** che esistono solo nel browser di sviluppo, il pannello resta nascosto come oggi.

## Interfacce fra le task

### `@bookeeper/ui/quote` (task `quote-ui`, sui dati di `quote-data`)

`packages/ui/package.json` esporta `"./quote": "./src/quote/index.ts"`. L'indice esporta:

```ts
export type QuoteLang = 'it' | 'en';
export interface QuoteText { text: string; author: string; work: string | null }
export interface QuoteEntry { id: string; it: QuoteText | null; en: QuoteText | null }
export const QUOTES: readonly QuoteEntry[];
/** Entries with a text in `lang`, in file order. */
export function quotesIn(lang: QuoteLang): QuoteEntry[];
export function quoteText(id: string, lang: QuoteLang): QuoteText | null;
export type QuoteSize = 33 | 26 | 22 | 20;
export function quoteSize(text: string, opts: { columnPx: number; compact?: boolean }): QuoteSize;
export interface DeckOptions {
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  random?: () => number;
}
/** The next card of the deck of `lang`. */
export function nextQuote(lang: QuoteLang, opts?: DeckOptions): QuoteEntry;
/** One card per mount; a language change takes the next card of the new language only when the shown entry has no text in it. */
export function useOpeningQuote(lang: QuoteLang): QuoteEntry;
export interface QuotationProps { quote: QuoteText; size: QuoteSize; className?: string }
export function Quotation(props: QuotationProps): JSX.Element;
```

Il markup di `Quotation`:

- `figure`, con dentro `blockquote` e `figcaption`; la misura sta su `blockquote` come `font-size` in px;
- ogni riga del testo è un elemento a blocco, con il rientro di 1 em per le righe che continuano;
- i caporali sono `span` con `aria-hidden="true"`, il primo appeso nel margine;
- la didascalia è `autore · <cite>opera</cite>`, oppure il solo autore quando `work` è `null`.

### Setup (task `quote-setup`)

- `apps/setup/src/shell/quotes.ts` prende i dati da `@bookeeper/ui/quote`.
- `resolveQuote(ref, locale)` restituisce `ShownQuote | null`: `null` quando la citazione non ha testo in quella lingua.
- `ShownQuote` diventa `{ id, text, author, work: string | null }`.
- I gruppi del Setup saltano i testi `null`; le regole di lunghezza restano: 110 caratteri e 2 righe per benvenuto e congedo, 200 per l'avanzamento.
- `innerQuotes` sparisce: i dati arrivano già composti.
- `Frontispiece` usa `Quotation` e `quoteSize(text, { columnPx: 600, compact })`. La compattazione con FLIP resta del Setup.
- `apps/setup/src/quotes.json`, `scripts/setup/quotes.mjs` e `scripts/setup/quotes.test.mjs` si tolgono.

### App desktop (task `welcome-panel`)

- `BrandPanel` usa `useOpeningQuote(useLocale())` e `Quotation` con `quoteSize(text, { columnPx: 348 })`.
- `WelcomeView` mostra titolo e sottotitolo solo senza una libreria salvata.

## Regole

- **Dipendenze:** nessuna nuova.
- **TypeScript:** `packages/ui/tsconfig.json` riceve `"resolveJsonModule": true` (task `quote-ui`). L'app e il Setup lo hanno già.
- **Interfaccia:** Impeccable in modalità **Operate** (`.claude/skills/impeccable/`):
  - setup con `impeccable context --target apps/desktop/src/modules/welcome/WelcomeView.tsx`, oppure con il file del Setup che tocchi;
  - `reference/craft-floor.md` prima di ogni modifica dell'interfaccia;
  - `impeccable detect --json` pulito alla fine.

  La composizione è quella degli schizzi approvati: misure, gerarchia e testi. Il salvataggio remoto dei rapporti NON si usa. Non proporre alternative di design: decidi secondo questa consegna e `DESIGN.md`, e scrivi nel rapporto cosa hai deciso.
- **Regole di sempre:**
  - nessun componente oltre 250 righe;
  - nessun testo dell'interfaccia nei componenti, perché i testi stanno nelle traduzioni. Le citazioni e le didascalie sono dati, non testi dell'interfaccia;
  - nessun colore letterale;
  - nelle animazioni solo `transform` e `opacity`, dentro `@media (prefers-reduced-motion: no-preference)`. I keyframes condivisi si chiamano con `global(…)`: lo controllano i test di stile;
  - WCAG 2.2 AA;
  - ogni comportamento ha un test.
- **Ambito:** ogni task tocca solo i file dichiarati.
- **Rischi:** nessuna modifica a `ops/`, ai workflow o al servizio degli aggiornamenti. Nessuna chiamata esterna dalle task: niente push, tag, release o richieste a GitHub.
- **Lingua:** testi per le persone in italiano e inglese, frasi brevi; commenti nel codice in inglese, solo dove servono.

## Cose che più facilmente farebbero male, e dove sono provate

1. **Un testo non verificato in una lingua compare in quella lingua.**
   - `quote-data`: una citazione di prova verificata solo in italiano ha `en: null`; una con `confidence: medium` è esclusa; una `scarta` è esclusa.
   - `quote-ui`: `quotesIn('en')` non contiene voci con `en: null`.
   - `quote-setup`: i gruppi inglesi del Setup non le contengono.
2. **Il mazzo con un `localStorage` rotto:** `getItem` o `setItem` lanciano un errore; il JSON salvato non è valido; c'è un `id` che non esiste più; manca un `id` nuovo; `next` è fuori. `nextQuote` restituisce sempre una voce e non lancia errori. In un giro intero non c'è ripetizione, e la prima carta del giro nuovo non è l'ultima uscita. Lo prova `quote-ui`.
3. **Le misure e i versi.** `quote-ui` prova `quoteSize`:
   - 51 caratteri danno 33; 90 danno 33; 91 danno 26; 140 danno 26; 141 danno 22; con `compact` è sempre 22;
   - con colonna 348: `"a\nb"` dà 33; un verso di 31 caratteri dà al massimo 22; un verso di 34 caratteri dà 22 (nessun gradino va bene);
   - `Quotation` disegna un elemento per riga e la didascalia senza « · » quando `work` è `null`.
4. **La citazione cambia mentre si usa la pagina.** `welcome-panel` prova che la citazione non cambia:
   - scrivendo in un campo;
   - aprendo un'altra delle tre strade;
   - dopo un accesso fallito.

   Prova anche che una nuova apertura della pagina, cioè un nuovo montaggio, mostra la carta successiva.
5. **Le parole cambiano.** `quote-data` confronta la sorgente e il file generato dopo una normalizzazione che porta le due forme di ogni sostituzione alla stessa. Per ogni testo devono coincidere. Prova anche che il file nel repository è quello che il generatore scrive oggi.
