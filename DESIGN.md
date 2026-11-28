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
  mobili di `shelf/`, che sono dati, e i temi di lettura e le velature del
  lettore (`packages/reader/src/model/themeColors.ts`, `highlightColors.ts`),
  dati anch'essi, presi dalle stesse scale (vedi «Lettore»).
- **Strategia**: restrained — accento primario solo per azioni, selezione e
  stato; i colori pieni vivono nei legni degli scaffali (`SHELF_COLORS`:
  salvia, terracotta, notte, prugna, ambra, grafite) e nei dorsi/copertine
  segnaposto (`CLOTH_TONES`).
- **Temi di lettura**: il lettore ha quattro temi, Chiaro, Seppia, Scuro e
  Nero, più Auto che segue l'app. Vengono dai neutri caldi, dall'ambra dei
  mobili e dal nero pieno, senza colori nuovi; finché il lettore è aperto
  li prendono anche popover, fogli, menu e dialog. Valori e regole in
  «Lettore».

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
- **Pagina del lettore**: il testo del libro usa il carattere dell'editore;
  se manca, Lora. I controlli del lettore restano in Inter. Dimensioni e
  interlinee in «Lettore».

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
  - Pagina del lettore: scorre di lato e segue il dito; il motore
    (foliate-js, non modificato) la anima in 300ms ease-out. Con `reduce`
    cambia di colpo (attributo `animated` tolto).
  - Controlli del lettore: entrano con opacità e 4px di spostamento (la
    barra in alto scende, quella in basso sale) in `--bk-dur` `--bk-ease`,
    escono in `--bk-dur-fast`. La linea sottile appare in `--bk-dur`.
  - Foglio del lettore (telefono): sale di 24px con dissolvenza,
    `--bk-dur-slow` `--bk-ease`.

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
  (`role="progressbar"`; sulla copertina della griglia sta senza disco
  sotto, con una `drop-shadow` sul `--bk-scrim`: a 0% è un anello vuoto e
  la copertina si vede attraverso), `FillBar` (track su `--bk-inset`, soglie
  ok/warn/danger), `StatCard` (KPI editoriale: label piccola, valore grande
  in Lora, count-up; niente icon-pill hero-metric).
- **Citazione** (`quote`): `Quotation` è la composizione del frontespizio:
  - Lora 500, interlinea 1,24, `text-wrap: balance`;
  - caporali in `--bk-accent-text`, il primo appeso nel margine;
  - versi a capo; di quello troppo lungo per la colonna continuano solo le ultime parole, rientrate di 1 em (`text-wrap: wrap`);
  - didascalia «autore · opera» in Inter 13, l'opera in Lora corsivo.

  La misura la dà `quoteSize`: 33, 26, 22 o 20 px secondo lunghezza e colonna. I versi si misurano con gli avanzamenti di Lora 500 in `advances.json`, scritti da `scripts/quote-advances.mjs`. I dati sono `QUOTES`, le citazioni verificate per lingua, generate da `scripts/quotes.mjs`. `nextQuote` e `useOpeningQuote` le distribuiscono come un mazzo, senza ripetizioni. La usano la pagina d'apertura dell'app e il Setup.
- **Marchio**: `mark.png`, nella pagina d'apertura e nel Setup, è l'icona dell'app (`apps/desktop/src-tauri/icons/128x128.png`) copiata uguale.
- **Scaffale** (`shelf`): `ShelfUnit` — mobile con cornice nel colore
  scaffale, fondale scurito, mensole con ombra portata, dorsi
  bottom-aligned di larghezza e altezza deterministiche (`spineWidth`,
  `spineHeight`), spostamento da tastiera, annunci per screen reader.
- **Shell** (nelle app): sidebar + topbar su `--bk-chrome`; voce attiva =
  pillola su `--bk-surface` con icona in primary (niente barre laterali).
  Sul telefono la navigazione è una barra di schede in basso (`TabBar` nell’app mobile).
  Il lettore (`/read/:bookId`) sta fuori dalla shell: sul computer senza
  sidebar, sul telefono senza barra delle schede.
- **Stato nelle card** (Prestiti/Wishlist): MAI side-stripe; lo stato tinge
  l'intero bordo (`color-mix` col token del bordo) e il `Tag` resta
  l'indicatore esplicito.

## Zona pericolosa

Decisione del proprietario: il rosso non resta sempre in vista. Compare quando
si preme per un'operazione pericolosa o irreversibile, nel pop-up di conferma.
L'unica eccezione sono le impostazioni, dove le operazioni pericolose stanno
fisse in una **zona pericolosa**. Modalità Operate: evidente, non urlata; il
rosso dice «attenzione», non «errore».

- **Dove sta la zona fissa**: solo in fondo alle sezioni delle Impostazioni del
  desktop (ripristino da file, esci da questo dispositivo, condivisione) e
  dell'Account del telefono (scollega questo telefono).
- **Altrove** (scheda del libro, selezione, mobili e stanze, prestiti,
  wishlist, tag, persone, dispositivi) l'azione resta al suo posto, in un menu o
  in un bottone normale, senza rosso; premendola si apre la conferma
  `tone="danger"`, che dice la conseguenza.
- **`DangerZone`** (`base`): `<section>` col nome dal titolo; contorno
  `1px solid --bk-danger`, fondo `--bk-danger-bg`, raggio `--bk-radius`; icona
  `alert` e titolo in `--bk-danger-strong`, descrizione facoltativa; livello del
  titolo a scelta (predefinito `h3`). Il kit non contiene testi.
- **`DangerAction`**: riga con titolo, conseguenza in una frase e a destra il
  comando (un `Button variant="danger"` passato da chi la usa). Righe separate
  da un filetto tinto di rosso; sotto i 480px il comando va sotto il testo, a
  tutta larghezza.
- **Menu**: le voci pericolose stanno sempre in fondo, separate da un divisore,
  in rosso.
- **Conferme**: un'operazione irreversibile si conferma con `Dialog
  tone="danger"` (contorno `2px --bk-danger`, icona `alert` prima del titolo) e
  dice la conseguenza. `ConfirmDialog` con `tone="danger"` lo fa da sé.
- **Toni `danger`**: `Button` (`ghost`, `secondary`) e `IconButton` hanno
  `tone="danger"`, ma i comandi che aprono una conferma restano neutri: il
  rosso sta nella conferma.
- **Quando NON si usa**: solo per ciò che distrugge, revoca, sostituisce o fa
  perdere l'accesso. Mai per azioni che si annullano senza danno.

## Lettore (`packages/reader`)

Decisione del proprietario: struttura **«Pannello compagno»**. Il lettore è
la pagina: mentre leggi ci sono solo il testo e una linea di 2px; al tocco
tornano la barra in alto, l'avanzamento con i capitoli e, a richiesta, il
pannello compagno con Indice, Note e Cerca. Modalità Operate. Lo stesso
codice sta in `packages/reader`, e le due app lo montano.

### Temi di lettura

Fonte: `model/themeColors.ts`. Variabili `--rd-*` (`themeVars`) sulla radice
del lettore: `--rd-page`, `--rd-ink`, `--rd-muted`, `--rd-faint`,
`--rd-rule`, `--rd-raised`, `--rd-inset`, `--rd-accent-text`,
`--rd-accent-soft`, `--rd-accent-strong`, `--rd-on-accent`,
`--rd-accent-control`, `--rd-accent-solid`.

| Tema | Pagina | Inchiostro | Rialzato | Filetto | Accento testo |
| --- | --- | --- | --- | --- | --- |
| Chiaro | `#fbfaf8` | `#27241f` | `#ffffff` | `#ebe7e0` | `#3b6953` |
| Seppia | `#f2e8d9` | `#3a3224` | `#f8f1e6` | `#e2d3ba` | `#3b6953` |
| Scuro | `#161512` | `#d8d6d2` | `#211f1b` | `#2c2a25` | `#92baa6` |
| Nero | `#000000` | `#b8b4ac` | `#0e0d0b` | `#1f1d1a` | `#92baa6` |

- **Da dove vengono**: Chiaro e Scuro sono i neutri caldi dell'app (pagina
  = `--bk-bg` di ciascun tema), Seppia viene dall'ambra dei mobili, Nero è
  il nero pieno con inchiostro smorzato. L'accento è la scala salvia:
  `--rd-accent-solid` `#3b6953` (gradino 600) in ogni tema, per il
  riempimento dell'avanzamento.
- **Auto** = Chiaro o Scuro, come l'app. È il tema di partenza.
- **Gli strati prendono il tema**: finché il lettore è aperto
  `useDocumentTheme` mette su `<html>` le `--rd-*` e, con `overlayVars`, i
  token `--bk-*` delle superfici, del testo e dell'accento ricolorati dal
  tema (più `color-scheme`); all'uscita rimette i valori di prima. Così
  popover, fogli, menu e dialog, che vanno in portale su `body`, non
  restano mai bianchi su una pagina scura. Il pannello compagno fa lo
  stesso per le `PillTabs` del kit.
- **Contrasto**: testo a 4,5:1 in ogni tema, anche sopra le quattro
  velature; lo verifica `model/themes.test.ts`.

### Evidenziazioni

- **Quattro colori, quelli dei mobili** (`model/highlightColors.ts`):
  Ambra `#c9954a`, Salvia `#7c8f6a`, Terracotta `#b8704f`, Notte `#3a4a6b`
  (`#858fa3` sui temi scuri). Il colore pieno è il pallino negli elenchi.
- **Velatura sul testo**: il colore mescolato nella pagina (sui temi chiari
  50, 45, 42, 30%; su quelli scuri 42, 48, 44, 46%), disegnato con fusione
  `darken` sulle pagine chiare e `lighten` su quelle scure: l'inchiostro
  resta esattamente quello del tema.
- Un'evidenziazione con nota ha sotto un filetto di 1px nel colore
  dell'inchiostro.
- **La selezione è quella del sistema** (`::selection` non toccato), così
  non si confonde con un'evidenziazione.

### La pagina

- **Carattere** (`frame/bookCss.ts`, `fallbackFont.ts`): Editore (di
  partenza), Lora, Inter, Serif (`ui-serif, Georgia`), Sans (`system-ui`).
  Con «Editore» resta il carattere del libro; se il libro non ne ha uno
  (il `body` nomina solo una famiglia generica e non c'è un `@font-face`
  suo), Lora. Un carattere scelto arriva a tutto il libro, qualunque cosa
  dica l'editore, tranne immagini e testo a larghezza fissa (`code`, `pre`,
  `kbd`, `samp`, `tt`).
- **Stili dell'editore** (accesi di partenza): il foglio di stile del libro
  resta, ma mai i suoi colori: inchiostro e fondo sono sempre quelli del
  tema, i collegamenti in `--rd-accent-text`. Spenti, valgono solo
  carattere, allineamento e spaziature del lettore.
- **Misure**: dimensione da 12 a 32px a passi di 1 (partenza 18px, `−` e
  `+`); interlinea 1,4, 1,6 o 1,8 (partenza 1,6); margini stretti, medi,
  ampi = 4%, 7%, 10% della pagina per lato, e la distanza fra le due pagine
  è il doppio; colonna al massimo 720px. Due pagine affiancate da 1000px di
  finestra, se la regolazione è accesa. Giustifica e sillabazione accese di
  partenza.
- **PDF**: contano solo tema, zoom («Adatta alla larghezza» o «alla
  pagina») e due pagine; le altre righe sono spente.
- Le regolazioni valgono per tutti i libri su quel dispositivo
  (`bookeeper.reader.settings`).

### Struttura e misure

- **Computer**: griglia di tre righe, barra in alto 52px, pagina, barra in
  basso 56px; tutto sul `--rd-page`, barre separate da un filetto di 1px
  `--rd-rule`. Le barre nascoste tengono la loro riga, così la pagina non
  si sposta mai. La barra in alto è anche la barra della finestra (si
  trascina; a destra i pulsanti della finestra).
- **Pannello compagno**: 360px a destra, filetto `--rd-rule` a sinistra.
  Da 1100px di finestra spinge la pagina, sotto la copre come un cassetto.
  Aperto o chiuso, resta com'era la volta prima.
- **Telefono**: la pagina prende tutto lo schermo dentro le aree sicure; le
  barre stanno sopra la pagina senza spostarla. Barra in alto 52px più
  l'area sicura.
- **Linea sottile**: 2px, tutta la larghezza, binario `--rd-rule` con il
  riempimento `--rd-accent-solid`. Sul telefono rientra di 16px per lato e
  sta 8px sopra l'area sicura. Si vede solo a controlli nascosti.
- **Fogli del telefono** (`Sheet`): dal bordo basso, raggio `--bk-radius-lg`
  sopra, maniglia 36×4px. Il pannello si apre al 70% dell'altezza e si tira
  fino in cima; Aspetto si apre alto quanto il contenuto (al massimo 92%).
  Chiudi 44×48px.
- **Bersagli**: pulsanti delle barre 36px sul computer, 44×48px sul
  telefono; la barra di avanzamento è alta 32px, 48px al tatto.

### Controlli

- **Barra in alto**: a sinistra «Indietro» (icona e parola sul computer,
  solo icona sul telefono); al centro il titolo (Inter 14, 500) e
  «· Capitolo» in `--rd-muted`, sul computer; a destra Cerca, Segnalibro,
  Aspetto e Pannello sul computer, Aspetto e «⋯» sul telefono. Pulsanti
  trasparenti in `--rd-muted`; al passaggio `--rd-inset` e `--rd-ink`;
  attivo (pannello aperto) `--rd-accent-soft` con `--rd-accent-text`. Ogni
  icona ha il nome accessibile e, sul computer, il tooltip.
- **Barra in basso**: Inter 13. La barra di avanzamento, poi «4% · 9 min
  alla fine del capitolo · 11 h 20 min al libro»: percentuale 600 in
  `--rd-ink`, tempi in `--rd-muted`, `tabular-nums`. Sul telefono solo
  «4% · 9 min», e sotto Indice, Note, Cerca, Segna, icona con didascalia di
  12px, a colonne uguali. I tempi compaiono solo quando c'è una velocità
  misurata su quel dispositivo.
- **Barra di avanzamento** (`ProgressSlider`, un cursore): binario di 6px
  `--rd-rule`, riempimento `--rd-accent-solid`, tacche dei capitoli di
  1×10px in `--rd-faint` (passate: `--rd-on-accent`). La manopola (14px,
  bordo 2px nel colore della pagina) compare al passaggio, al fuoco e
  trascinando; trascinando compare «Capitolo VIII · 21%» su
  `--rd-ink`. Al rilascio si salta lì.
- **Percentuali** (`ui/view/format.ts`): un decimale sotto il 10%, con la
  virgola («0,4%»). Tempi «9 min», «11 h 20 min», «meno di 1 min».
- **Fuoco**: anello di 2px in `--rd-accent-text`, scostato di 2px.
- **I controlli spariscono** alla prima pagina girata e tornano col tocco
  al centro (telefono), col mouse nella fascia alta (64px) o bassa (72px)
  della finestra (computer), o con Esc. Restano mentre c'è una domanda o un
  popover aperto. Sul computer il clic gira pagina solo nel terzo esterno;
  al centro serve per selezionare.

### Domande e salti

- **Le domande stanno nella barra in basso, mai sopra il testo**: tutta la
  barra passa su `--rd-accent-soft`, con l'icona del dispositivo in
  `--rd-accent-text`, la domanda in grassetto e a destra un comando piano e
  uno primario (`--rd-accent-strong`, contorno `--rd-accent-text`). Si
  annunciano (`aria-live="polite"`) e aspettano la scelta.
  - «Continua da dove eri sul telefono?» (o «sul computer», «su
    KOReader», «sul Kobo»), con percentuale, capitolo e quando («adesso»,
    «alle 15:49», «ieri alle 22:40»); «Resta qui» e «Vai al 45%». Girare
    pagina o Esc vale «Resta qui».
  - Fine del libro: «Hai finito il libro. Segnarlo come letto?», con «Non
    ancora» e «Segna come letto».
- **«Torna al …»**: dopo ogni salto (indice, nota, risultato, barra, «Vai
  al …») la barra in basso mostra una pillola con contorno di 1px in
  `--rd-accent-text`. Sparisce dopo due pagine girate in avanti, o quando
  la si usa.
- **L'articolo segue il numero scritto**: «allo 0%», «allo 0,4%»,
  «all'1%», «all'8%», «all'11%», «all'80%»…«all'89%», «al» per gli altri
  («al 45%», «al 100%»). Vale per «Torna» e per «Vai».

### Pannello compagno

- `PillTabs` del kit su Indice, Note, Cerca, nei colori del tema. Sul
  telefono le stesse schede in un foglio, «Pannello del libro», con il
  contenuto allineato al titolo.
- **Indice**: righe di almeno 40px, rientro di 16px per livello, a destra
  la percentuale dove comincia (12px, `tabular-nums`); il capitolo
  corrente su `--rd-accent-soft`, in `--rd-accent-text` 600.
- **Note**: filtri a pillola alti 32px con contorno `--rd-rule` («Tutte»,
  «Segnalibri», i quattro colori col pallino; scelto: `--rd-accent-soft`
  senza contorno); voci separate da un filetto, con capitolo e percentuale,
  il testo in Lora 16/1,5 e la nota su `--rd-inset`. In fondo «Visibili
  solo a te» ed «Esporta in Markdown», bottone con contorno.
- **Cerca**: campo alto 44px (fuoco: anello di 2px `--rd-accent-control`),
  almeno 2 caratteri; risultati raggruppati per capitolo, con il pezzo di
  frase in Lora 15/1,5 e la parola su `--rd-accent-strong`; il risultato
  scelto su `--rd-accent-soft`; in fondo «Cerco nel resto del libro…
  60%» su un binario di 4px.
- **Segni della ricerca sulla pagina**, nel colore dei collegamenti del
  tema: il risultato scelto ha un contorno scostato di 2px dalle lettere,
  gli altri sono sottolineati. Ci sono solo mentre la ricerca è aperta.

### Selezione e note

- **Barra della selezione**: sopra la selezione sul computer, sotto sul
  telefono (per non coprire il menu del sistema). Superficie
  `--rd-raised`, filetto `--rd-rule`, raggio `--bk-radius-lg`,
  `--bk-shadow-2`. I quattro pallini da 18px (scelto: anello `--rd-raised`
  + `--rd-accent-solid`), poi «Nota», «Copia», «Cerca sul web»; su
  un'evidenziazione anche «Togli». Sul telefono le azioni sono solo icone,
  e le parole restano per le tecnologie assistive.
- **Nota**: una finestrella sul computer, un foglio sul telefono.

### Aspetto

- Popover di 360px dal pulsante Aa sul computer, foglio alto quanto il
  contenuto sul telefono. I cambi si vedono subito.
- **Tema**: cinque tessere «Aa» in Lora nei colori del tema (48px di
  altezza, 56px sul telefono); Auto è divisa in diagonale fra Chiaro e
  Scuro; la scelta ha un anello di 2px `--bk-accent-control`.
- **Carattere**: ogni nome è scritto nel suo carattere («Editore» in Lora).
- Le altre righe sono controlli segmentati (fondo `--bk-inset`, scelto
  `--bk-accent-surface-strong`), il − / + per la dimensione e tre
  interruttori. Sul telefono Interlinea e Margini stanno sulla stessa riga.
  In fondo «Vale per tutti i libri su questo computer» (o «telefono») e
  «Ripristina».

### Stati

- **Caricamento**: la copertina (120px) e «Apro il libro…», solo dopo
  300ms; sale di 4px entrando.
- **Errori**, al posto della pagina, centrati (al massimo 420px): titolo
  18px 600, una frase in `--rd-muted`, un'azione.
  - «Questo file non si apre» → «Scarica il file»;
  - «Il file manca sul server» → «Torna alla scheda del libro»;
  - «Sei offline e questo libro non è sul telefono» → «Torna alla scheda
    del libro».

  Senza strumenti di lettura: la barra in alto ha solo «Indietro» e il
  titolo, e non c'è né la barra in basso né la linea.
- **Offline sul telefono** (`OfflineControl`, sotto «Leggi» nella scheda
  del libro e nel menu «⋯»): «Scarica per leggere offline»; «Scarico…
  40%» con «Annulla»; «✓ Sul telefono · 2,4 MB» con «Togli dal telefono».
  Sotto «Leggi» il formato e il peso («EPUB · 2,4 MB»), solo il formato
  quando il libro è già sul telefono.
- **Su iPhone da Safari** il pulsante apre la spiegazione
  (`InstallSheet`): perché, su un riquadro tenue; i tre passi numerati in
  cerchi `--bk-accent-surface`, con le icone Condividi e Aggiungi dentro
  la frase e i nomi delle azioni in grassetto; «Si legge comunque online»;
  «Ho capito» primario a tutta larghezza, alto 48px.

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
- **Frontespizio**: la pagina d'apertura dell'app ha a sinistra la citazione
  di uno scrittore. Ne esce una nuova a ogni apertura, e resta ferma mentre
  la pagina è aperta. Il Setup ha lo stesso frontespizio. Per chi torna,
  sopra «Bentornato» non c'è un titolo.
- **Bersagli**: minimo 24×24px sul desktop, 44×44px sul telefono. Eccezione
  dichiarata: i dorsi dei mobili (`ShelfUnit`), perché la larghezza dice il
  numero di pagine.
- **Lettore**:
  - struttura «Pannello compagno», scelta dal proprietario fra pannello
    compagno, barra del tempo e binario nel margine;
  - i controlli spariscono mentre leggi e tornano al tocco, col mouse ai
    bordi o con Esc; resta solo la linea di 2px;
  - la posizione non salta mai da sola: il lettore chiede nella barra in
    basso e aspetta, e ogni salto lascia «Torna al …»;
  - la pagina scorre di lato e segue il dito;
  - temi che vengono dalla palette dell'app, e strati che prendono il tema;
  - il carattere dell'editore di partenza, Lora quando manca;
  - la selezione del sistema, separata dalle evidenziazioni nei colori dei
    mobili.
- Registro product, direzione "biblioteca moderna", il libro protagonista.

## Anti-pattern (vietati qui)

Side-stripe border-left colorati · gradient text · glassmorphism decorativo ·
hero-metric template · animazioni su proprietà di layout · dark mode
duplicato per componente quando i token bastano · colori letterali fuori da
`tokens.css`, `clothTone.ts`, `shelf/colors.ts` e, nel lettore,
`themeColors.ts` e `highlightColors.ts`.

Nel lettore, in più: una barra o uno strato chiaro su una pagina scura ·
vetro e sfocature · ombre sul testo · icone senza nome accessibile · salti
senza «Torna al …» · un lettore che sposta la posizione da solo · domande
sopra il testo invece che nella barra in basso · una selezione colorata come
un'evidenziazione · strumenti di lettura in uno stato d'errore · un
cruscotto pieno di icone sempre in vista.
