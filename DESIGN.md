# Design — Bookeeper Neo 2.0

Sistema visivo condiviso dall'app desktop (`apps/desktop`) e dalla PWA
(`apps/mobile`), che vive in `packages/ui` (`@bookeeper/ui`). Registro:
**product** — il design serve il compito, la familiarità è un pregio.
Direzione: **biblioteca moderna** — editoriale, caldo, preciso; profondità e
micro-interazioni contemporanee. Il libro è il protagonista.

## Fondazioni

### Colore

- **Primary**: verde-salvia, scala `--bk-primary-50` … `--bk-primary-950`
  in [tokens.css](packages/ui/src/tokens.css); `--bk-primary-500` = `#4d8369`.
  Identico in light e dark.
- **Neutri**: `--bk-neutral-0` … `--bk-neutral-950` caldi (`--bk-neutral-50`
  `#fbfaf8` → `--bk-neutral-950` `#0c0b0a`); in `html.dark` la scala è
  invertita.
- **Stati**: `--bk-ok`, `--bk-warn` (`#b7791f`), `--bk-danger` (`#b4493b`),
  ciascuno con `-bg` (velatura) e `-strong` (leggibile come testo su
  `--bk-surface`); `--bk-danger-fill` per i riempimenti, `--bk-on-primary`
  per il testo su primary, `--bk-focus` per l'anello di fuoco.
- **Token semantici dell'accento** (valori propri di ogni tema; nel tema
  scuro le superfici d'accento sono una tinta verde bassa sul fondo scuro):
  `--bk-accent-surface` (fondo tenue), `--bk-accent-surface-strong` (elemento
  selezionato o attivo), `--bk-on-accent-surface` (testo e icone su quei
  due fondi), `--bk-accent-text` (testo, collegamenti, icone nel colore
  d'accento), `--bk-accent-control` (`accent-color`, cursore, indicatori non
  testuali), `--bk-primary-fill` / `--bk-primary-fill-hover` (bottoni e
  controlli pieni: gradini 600 e 700 della scala verde, con `--bk-on-primary`
  sopra), `--bk-focus` (anello di fuoco).
- **Contrasto**: `--bk-text`, `--bk-text-muted`, `--bk-text-faint` e
  `--bk-accent-text` raggiungono 4,5:1 su `--bk-bg`, `--bk-surface`,
  `--bk-surface-raised`, `--bk-chrome` e `--bk-inset` in entrambi i temi;
  lo verifica `tokens.contrast.test.ts`.
- **Mai gradini grezzi nei moduli**: `--bk-primary-N` e `--bk-neutral-N`
  si usano solo in `tokens.css`. Kit e moduli delle app usano i token
  semantici (i test di stile lo vietano). Fanno eccezione i colori dei
  mobili di `shelf/`, che sono dati.
- **Strategia**: restrained — accento primario solo per azioni, selezione e
  stato; i colori pieni vivono nei legni degli scaffali (`SHELF_COLORS`:
  salvia, terracotta, notte, prugna, ambra, grafite) e nei dorsi/copertine
  segnaposto (`CLOTH_TONES`).

### Token — `packages/ui/src/tokens.css`

Prefisso `--bk-`. Unica fonte per superfici light/dark: i componenti usano
`--bk-surface` / `--bk-border` / `--bk-text-*` e NON scrivono blocchi
`html.dark` duplicati.

- **Superfici**: `--bk-bg` (fondo) · `--bk-surface` (card) ·
  `--bk-surface-raised` (dialog, popover) · `--bk-chrome` (sidebar/topbar) ·
  `--bk-inset` (incassi: track, nicchie) · `--bk-border`,
  `--bk-border-strong`.
- **Testo**: `--bk-text-strong`, `--bk-text`, `--bk-text-muted`,
  `--bk-text-faint`.
- **Ombre** (tinte calde, non nero puro): `--bk-shadow-1`, `--bk-shadow-2`,
  `--bk-shadow-3`, `--bk-shadow-book`, `--bk-shadow-book-lift`.
- **Radius**: `--bk-radius-sm` 8px · `--bk-radius` 12px · `--bk-radius-lg` 16px.
- **Z-index semantici**: `--bk-z-sticky` 100 · `--bk-z-dropdown` 1000 ·
  `--bk-z-overlay` 1100 · `--bk-z-modal` 1200 · `--bk-z-toast` 1300 ·
  `--bk-z-tooltip` 1400.

### Tipografia

- `--bk-font-ui` (**Inter Variable**: label, corpo, dati) e `--bk-font-serif`
  (**Lora Variable**: titoli, valori editoriali), caricati da
  [fonts.css](packages/ui/src/fonts.css) senza download a runtime
  (sottoinsiemi latin e latin-ext).
- Scala fissa (registro product), corpo 14px; numeri `tabular-nums`.

### Motion

Token: `--bk-dur-fast` 150ms (feedback) · `--bk-dur` 200ms (stato) ·
`--bk-dur-slow` 280ms (entrance, layout) · `--bk-ease`
`cubic-bezier(0.25, 1, 0.5, 1)` (out-quart) · `--bk-ease-snappy`
`cubic-bezier(0.22, 1, 0.36, 1)` (out-quint) · `--bk-ease-spring`
`cubic-bezier(0.34, 1.56, 0.64, 1)` (elastica, solo per i movimenti
approvati qui sotto). Regole:

- Solo `transform` e `opacity`. Eccezioni, tutte nel codice: il
  riempimento di `ProgressRing` (`stroke-dashoffset`), l'ombra di
  `BookCover` al passaggio (`box-shadow`) e il colore delle etichette di
  `PillTabs` (`color`), e la crescita del `Dialog`: l'altezza del
  pannello anima (Web Animations, `--bk-dur-slow` `--bk-ease`, centrato)
  quando il contenuto cambia, e la larghezza passa tra `default` e `wide`
  (unica deroga per altezza e larghezza). Le barre (`FillBar`) animano con `scaleX`, origin left.
- Entrance condivisa `bk-rise` (fade + alza 6px); lo stagger si fa con `--i`.
  Il default è visibile: l'animazione parte da `from{}`.
- Uscite più brevi delle entrate.
- **`prefers-reduced-motion`**: ogni animazione e transizione sta dentro
  `@media (prefers-reduced-motion: no-preference)`; con `reduce` lo stato
  finale è immediato (il count-up salta al valore, il dorso estratto passa
  a un contorno fisso).
- **Movimenti approvati** (mockup 2A):
  - Libro 3D (`Book3D`): riposo `rotateY(-8deg)` con prospettiva 900px, al
    passaggio `rotateY(-18deg)`, `--bk-dur-slow` `--bk-ease`.
  - Anello di avanzamento (`ProgressRing`): si riempie in 600ms
    `--bk-ease` al montaggio.
  - Dorso che si sfila (`ShelfUnit`): al passaggio `translateY(-2.5px)`;
    nel "Dov'è?" il dorso evidenziato esce `translateY(10px) scale(1.06)` con
    `--bk-dur-slow` `--bk-ease-spring`, alone che pulsa tre volte.
  - Pillola scorrevole (`PillTabs`): `translateX`, `--bk-dur`
    `--bk-ease-spring`.
  - Tooltip: `scale(0.92)` → 1, `--bk-dur-fast` `--bk-ease-spring`.
  - Copertina (`BookCover`) al passaggio: `translateY(-3px) rotate(-0.5deg)`
    e `--bk-shadow-book-lift`, `--bk-dur` `--bk-ease`.
  - Count-up di `StatCard`: 600ms.

## Vocabolario componenti (`packages/ui/src`)

- **Base** (`base`): `Button` (varianti `primary`, `secondary`, `ghost`,
  `danger`; press `scale(0.98)`), `IconButton`, `Icon` (set a tratto unico),
  `Input`, `Textarea`, `Field`, `Tag` (toni `neutral`, `primary`, `ok`,
  `warn`, `danger`), `Divider`, `Kbd`, `Skeleton`, `Spinner`, `EmptyState`.
- **Overlay** (`overlays`): `Dialog`, `Drawer`, `Menu`, `Select`,
  `PillTabs`, `Tooltip` (con `TooltipProvider`), `ToastProvider` /
  `useToast`.
- **Libro** (`book`): `BookCover` (radius asimmetrico dorso 2px / taglio
  5px, piega del dorso, `--bk-shadow-book`; placeholder = `clothTone`
  deterministica + iniziale in Lora), `Book3D` (scheda libro), `ProgressRing`
  (`role="progressbar"`), `FillBar` (track su `--bk-inset`, soglie
  ok/warn/danger), `StatCard` (KPI editoriale: label piccola, valore grande
  in Lora, count-up; niente icon-pill hero-metric).
- **Scaffale** (`shelf`): `ShelfUnit` — mobile con cornice nel colore
  scaffale, fondale scurito, mensole con ombra portata, dorsi
  bottom-aligned di larghezza e altezza deterministiche (`spineWidth`,
  `spineHeight`), spostamento da tastiera, annunci per screen reader.
- **Shell** (nelle app): sidebar + topbar su `--bk-chrome`; voce attiva =
  pillola su `--bk-surface` con icona in primary (niente barre laterali).
  Sul telefono la navigazione è una barra di schede in basso (`TabBar` nell’app mobile).
- **Stato nelle card** (Prestiti/Wishlist): MAI side-stripe; lo stato tinge
  l'intero bordo (`color-mix` col token del bordo) e il `Tag` resta
  l'indicatore esplicito.

## Decisioni approvate

Una revisione automatica (inclusi i comandi Impeccable del run 7B) NON deve
cambiare:

- **Palette**: verde-salvia (`--bk-primary-*`, 500 = `#4d8369`) e neutri
  caldi (`--bk-neutral-*`, ombre con inchiostro caldo). Nessuna deriva verso
  blu/viola/grigi freddi.
- **Caratteri**: Inter Variable per la UI, Lora Variable per i titoli e i
  valori editoriali, come in `fonts.css`.
- **Curve elastiche dei movimenti approvati**: `--bk-ease-spring` su
  `PillTabs`, `Tooltip` e dorso estratto in `ShelfUnit`; libro 3D, anello di
  avanzamento e sollevamento della copertina come descritti in Motion. Non
  vanno sostituiti con curve piatte.
- **Scheda del libro**: il soprattitolo sta sotto il titolo.
- **Bersagli**: minimo 24×24px sul desktop, 44×44px sul telefono. Eccezione
  dichiarata: i dorsi dei mobili (`ShelfUnit`), perché la larghezza dice il
  numero di pagine.
- Registro product, direzione "biblioteca moderna", il libro protagonista.

## Anti-pattern (vietati qui)

Side-stripe border-left colorati · gradient text · glassmorphism decorativo ·
hero-metric template · animazioni su proprietà di layout · dark mode
duplicato per componente quando i token bastano · colori letterali fuori da
`tokens.css`, `clothTone.ts` e `shelf/colors.ts`.
