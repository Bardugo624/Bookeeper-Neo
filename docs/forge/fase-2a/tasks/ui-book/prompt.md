Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# UI: copertina, libro 3D, anello, barre, KPI

## Obiettivo

Consegnare `@bookeeper/ui/book`. La task `ui-base` è già unita. NON aggiungere dipendenze. Riferimento di comportamento: `BookCover`, `StatCard` e le barre di riempimento della 0.3 in `clients/desktop/frontend/src` e la sezione che li descrive in `DESIGN.md`. Leggili; non copiare il codice Vue.

## Cosa fare

Tutto sotto `packages/ui/src/book/`, un componente per file con il proprio `.module.css`, più `index.ts`.

- **`clothTone(seed)`**: sceglie una tinta da una tavolozza fissa di almeno otto tinte "tela" smorzate (parti da `CLOTH_TONES` della 0.3). Deterministica: stesso seme, stessa tinta. Stringa vuota: prima tinta.
- **`BookCover`**: proporzione 2:3, `width` predefinita 144. Raggio asimmetrico (dorso 2px, taglio 5px), piega del dorso, luce d'ambiente anche sopra un'immagine reale, `--bk-shadow-book`. Senza `src`: fondo `color ?? clothTone(title)` e iniziale del titolo in Lora (prima lettera alfanumerica, maiuscola; titolo vuoto: nessuna iniziale). Con `src`: `<img>` con `alt` vuoto, `loading="lazy"`, `decoding="async"`; se l'immagine fallisce si torna al segnaposto. `lift`: al passaggio `translateY(-3px) rotate(-0.5deg)` e `--bk-shadow-book-lift`. Accetta `children` posizionati sopra la copertina (etichette, anello).
- **`Book3D`**: come nel mockup della scheda libro. Dorso a sinistra, più scuro della copertina (stessa tinta scurita, non un colore scritto: usa `color-mix` con il nero), taglio delle pagine a destra in avorio con righe sottili, copertina con titolo in Lora e autore in corsivo in basso (nascosti se c'è `src`). Spessore del dorso da `pages`: 14px a 100 pagine o meno, 40px a 800 o più, lineare in mezzo; senza `pages`, 24px. Contenitore con `perspective`; posa a riposo `rotateY(-8deg)`; al passaggio `rotateY(-18deg)`. Con movimento ridotto resta nella posa a riposo.
- **`ProgressRing`**: SVG, due cerchi, tratto `--bk-inset` e `--bk-primary-500`, estremità arrotondate. `value` è limitato a 0..1. `role="progressbar"`, `aria-valuemin=0`, `aria-valuemax=100`, `aria-valuenow` intero, `aria-label` da `label`. `children` al centro (percentuale). Riempimento animato in 600 ms tramite `stroke-dashoffset`: è l'unica eccezione ammessa alla regola "solo transform e opacity", e sta dentro `prefers-reduced-motion: no-preference`.
- **`FillBar`**: traccia `--bk-inset` alta 8, indicatore con `transform: scaleX(value)` e `transform-origin: left`. `tone="auto"`: `ok` sotto 0,75, `warn` da 0,75, `danger` da 0,95. Stessi attributi ARIA dell'anello.
- **`StatCard`**: etichetta con glifo piccolo colorato per ruolo, valore grande in Lora. Con `value` numerico: conteggio da 0 al valore in 600 ms con `requestAnimationFrame`; immediato con movimento ridotto (`matchMedia`). Il valore finale è sempre nel DOM come testo accessibile.

Le tinte delle copertine sono l'unico posto dove un colore può stare fuori da `tokens.css`: tienile in un solo file, `clothTone.ts`.

## Test

- `clothTone`: deterministica; almeno cinque tinte diverse su venti titoli; stringa vuota.
- `BookCover`: segnaposto con iniziale; titolo che inizia con un segno di punteggiatura; titolo vuoto; con `src` c'è un'immagine con `alt=""`; evento `error` sull'immagine riporta al segnaposto; `color` esplicito vince su `clothTone`; i `children` sono resi.
- `Book3D`: titolo e autore visibili senza `src`; spessore del dorso per `pages` 50, 100, 450, 800, 2000 e assente (leggi la variabile CSS o lo stile calcolato impostato dal componente).
- `ProgressRing`: `aria-valuenow` per 0, 0,62, 1; valori fuori intervallo (-1, 2, `NaN`) limitati a 0..1.
- `FillBar`: tono automatico alle soglie 0,74, 0,75, 0,95; `scaleX` uguale al valore.
- `StatCard`: con movimento ridotto il valore finale è subito presente; con timer finti arriva al valore finale.
- Test di stile come in `ui-base`, per `src/book`: nessun colore scritto nei `.module.css` (le tinte stanno in `clothTone.ts`, l'avorio delle pagine è un token esistente o una variabile locale dichiarata in un solo punto), animazioni solo dentro `prefers-reduced-motion: no-preference`.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` e `npm test -w @bookeeper/ui` passano.
- `import { clothTone, BookCover, Book3D, ProgressRing, FillBar, StatCard } from '@bookeeper/ui/book'` compila da un file di test.
- Nessun componente supera 250 righe.
- `git diff --stat` rispetto alla base tocca solo file sotto `packages/ui/src/book/`.
