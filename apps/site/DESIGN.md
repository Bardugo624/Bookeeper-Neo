---
name: Bookeeper — homepage
description: La tavola d'architetto di una casa di famiglia, inchiostrata in salvia Bookeeper.
colors:
  sheet: "#eef5f0"
  sheet-2: "#e1ede6"
  grid: "rgb(48 85 69 / 0.07)"
  rule: "#b4cfc1"
  ink: "#3b6953"
  ink-strong: "#223830"
  text: "#10201a"
  muted: "#305545"
  wall: "#284439"
  hatch-bg: "#d3e5da"
  found: "#c9954a"
  found-ink: "#6f4f22"
  found-wash: "rgb(201 149 74 / 0.16)"
  btn: "#305545"
  btn-hover: "#223830"
  btn-text: "#f1f7f4"
  code: "#dcebe2"
typography:
  display:
    fontFamily: "'Lora Variable', 'Lora', Georgia, serif"
    fontSize: "clamp(2.375rem, 3.9vw, 3.875rem)"
    fontWeight: 500
    lineHeight: 1.04
    letterSpacing: "-0.018em"
  display-answer:
    fontFamily: "'Lora Variable', 'Lora', Georgia, serif"
    fontSize: "0.64em"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "'Lora Variable', 'Lora', Georgia, serif"
    fontSize: "clamp(2rem, 3.6vw, 3.25rem)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.014em"
  title:
    fontFamily: "'Lora Variable', 'Lora', Georgia, serif"
    fontSize: "clamp(1.625rem, 2.6vw, 2.25rem)"
    fontWeight: 500
    lineHeight: 1.15
  title-sm:
    fontFamily: "'Lora Variable', 'Lora', Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 500
    lineHeight: 1.2
  quote:
    fontFamily: "'Lora Variable', 'Lora', Georgia, serif"
    fontSize: "clamp(1.25rem, 1.8vw, 1.5rem)"
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 400
    lineHeight: 1.6
    fontFeature: "'cv11', 'ss01'"
  body-sm:
    fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Inter Variable', 'Inter', system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  hair: "3px"
  sm: "4px"
  md: "6px"
  lg: "8px"
  shot: "10px"
  phone: "22px"
spacing:
  gutter: "clamp(16px, 4vw, 56px)"
  section: "clamp(72px, 10vw, 136px)"
  frame: "clamp(0px, 1vw, 14px)"
components:
  button-primary:
    backgroundColor: "{colors.btn}"
    textColor: "{colors.btn-text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "16px 24px"
  button-primary-hover:
    backgroundColor: "{colors.btn-hover}"
  button-quiet:
    textColor: "{colors.ink-strong}"
    padding: "8px 0"
  theme-toggle:
    textColor: "{colors.ink-strong}"
    rounded: "{rounded.md}"
    size: "40px"
  chip:
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "9px 12px"
  chip-pressed:
    backgroundColor: "{colors.ink-strong}"
    textColor: "{colors.sheet}"
  plan-tag:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.text}"
    rounded: "{rounded.sm}"
    padding: "10px 14px 11px"
  panel:
    backgroundColor: "{colors.sheet-2}"
    rounded: "{rounded.lg}"
    padding: "clamp(20px, 2.4vw, 32px)"
  code-block:
    backgroundColor: "{colors.code}"
    textColor: "{colors.text}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
---

# Design System: Bookeeper — homepage

Questo è il sistema della homepage pubblica (`apps/site`, www.neokeeper.dev).
Il sistema dell'app desktop e del telefono resta nel
[DESIGN.md della radice](../../DESIGN.md) e non cambia per questo file. La
homepage ne eredita il marchio: verde salvia, Lora per i titoli, Inter per il
testo, l'icona dell'app, i legni dei mobili. Tutto il resto è suo.

I token vivono in [src/site.css](src/site.css), su `:root`, con i valori del
tema scuro sotto `prefers-color-scheme: dark` e `[data-theme='dark']`. I valori
in testa a questo file sono quelli del tema chiaro.

## Overview

**Creative North Star: "La tavola d'architetto"**

La pagina è una tavola di progetto per una casa di famiglia. Un foglio unico,
chiuso da una cornice a filetto, diviso in riquadri come un set di disegni:
cartiglio, pianta, prospetto, tabelle. L'inchiostro è il salvia di Bookeeper.
L'ambra, un legno da scaffale, è l'unico segno che dice «trovato».

La densità è quella di un disegno tecnico: filetti sottili, quote, etichette
in maiuscoletto, molto foglio libero. Niente card in griglia, niente sfondi a
fasce: le sezioni sono altre tavole dello stesso set, separate da un filetto.
Il movimento è uno solo e ha un senso: la linea che va dalla porta allo
scaffale, disegnata una volta per ogni risposta.

Il foglio chiaro è salvia pallido, mai crema. Il foglio scuro è salvia
profondo, con linee salvia chiare.

**Key Characteristics:**
- Un foglio unico con cornice a filetto da 1px; riquadri divisi da filetti.
- Inchiostro salvia su carta salvia, in due temi.
- Ambra solo per ciò che è trovato, indicato o a fuoco.
- Lora per titoli, domanda e citazioni; Inter per testo ed etichette.
- Etichette da disegno in maiuscoletto Inter, spaziate.
- Una sola animazione d'autore: la linea disegnata.

## Colors

Inchiostro e carta nella stessa famiglia salvia, più un solo colore caldo.

### Primary
- **Inchiostro salvia** (`ink`): linee della pianta, quote, archi delle porte,
  sottolineature dei link, il numero dei passi. Scuro: `#92baa6`.
- **Inchiostro forte** (`ink-strong`): titoli, contorni delle etichette sulla
  pianta, chip premuto, filetto sotto le intestazioni di tabella. Scuro:
  `#dcebe2`.
- **Bottone** (`btn` / `btn-hover`, testo `btn-text`): il solo riempimento
  pieno della pagina, per scaricare. Nel tema scuro si inverte: fondo
  `#f1f7f4`, passaggio `#dcebe2`, testo `#1a2c24`.

### Secondary
- **Ambra trovata** (`found`): il percorso, il punto d'arrivo, il mobile
  trovato, il dorso acceso, l'anello di fuoco, la selezione, il cursore, la
  sottolineatura al passaggio. Scuro: `#e0b062`.
- **Ambra scritta** (`found-ink`): il testo in ambra («terzo ripiano», «il
  tuo sistema»). Scuro: `#f0cd8f`.
- **Velo d'ambra** (`found-wash`): la stanza trovata, la riga del file giusto
  per il visitatore. Scuro: `rgb(224 176 98 / 0.14)`.

### Neutral
- **Carta da disegno** (`sheet`): il fondo. Scuro: `#1e332a`.
- **Carta incassata** (`sheet-2`): pannelli, seconda colonna, hover del
  bottone tema. Scuro: `#182a22`.
- **Griglia** (`grid`): il quadrettato da 20px, solo dietro la pianta. Scuro:
  `rgb(146 186 166 / 0.06)`.
- **Filetto** (`rule`): cornice, divisori, bordi di chip e pannelli. Scuro:
  `#3f5d4f`.
- **Testo** (`text`) e **testo tenue** (`muted`): corpo e testi secondari.
  Scuro: `#f1f7f4` e `#bcd6c8`.
- **Muro** (`wall`, con `hatch-bg`): muri a tratteggio, finestre, ante.
  Scuro: `#bcd6c8` e `#2b4438`.
- **Codice** (`code`): fondo dei blocchi di comandi. Scuro: `#162720`.

### Named Rules
**La regola del segno trovato.** L'ambra segna solo ciò che è trovato,
indicato o a fuoco. Mai decorazione, mai fondo di sezione, mai titoli.

**La regola della carta salvia.** Il foglio chiaro è salvia pallido. Mai
crema, mai bianco caldo, mai grigio freddo.

**La regola dei legni.** I legni dei mobili (salvia, terracotta, notte,
prugna, ambra, grafite) e le tele dei dorsi stanno solo nei mobili e nei
dorsi. Sono dati del disegno (`house.mjs`, `plan.mjs`), non token.

## Typography

**Display Font:** Lora Variable (con Lora, Georgia, serif)
**Body Font:** Inter Variable (con Inter, system-ui, sans-serif)
**Label/Mono Font:** ui-monospace per nomi di file e comandi

**Character:** Lora è la voce colta: fa la domanda, dà la risposta, cita.
Inter è la mano del disegnatore: precisa, piccola, ordinata.

### Hierarchy
- **Display** (Lora 500, `clamp(2.375rem, 3.9vw, 3.875rem)`, 1.04): solo la
  domanda «Dov'è …?» della prima schermata, massimo 14ch. Il titolo del libro
  è in corsivo.
- **Display answer** (Lora 500, 0.64em del display, 1.15, in `ink`): la
  risposta, subito sotto la domanda, nello stesso `h1`.
- **Headline** (Lora 500, `clamp(2rem, 3.6vw, 3.25rem)`, 1.08): i titoli di
  sezione.
- **Title** (Lora 500, `clamp(1.625rem, 2.6vw, 2.25rem)`, 1.15): didascalie
  di tabella, titoli dei passi. **Title-sm** (1.5rem) per i pannelli.
- **Quote** (Lora corsivo 400, `clamp(1.25rem, 1.8vw, 1.5rem)`, 1.4): le
  citazioni, max 38ch, con un filetto di 48px sopra.
- **Body** (Inter 400, 1.0625rem, 1.6, `cv11` `ss01`): il corpo, max 56–62ch.
  **Body-sm** (0.875rem) per note, metadati, piè di pagina.
- **Label** (Inter 600, 0.75rem, spaziatura 0.08–0.12em, maiuscolo): le
  annotazioni del disegno.
- **Mono** (0.8125–0.9375rem): nomi di file, comandi.

I numeri sono sempre `tabular-nums`.

### Named Rules
**La regola dell'annotazione.** Il maiuscoletto spaziato è scrittura da
tavola: nomi delle stanze, celle del cartiglio, intestazioni di tabella,
richiami sulle schermate, sottotitoli delle note di versione. Non sta mai
sopra un titolo come soprattitolo.

**La regola della domanda.** Il display è riservato alla domanda e alla sua
risposta. Una pagina, un display.

## Layout

La pagina è un foglio con un margine di `frame` e una cornice da 1px in
`rule`. Dentro, il margine laterale è `gutter`; il ritmo verticale delle
sezioni è `section`.

- **Prima schermata**: due colonne, cartiglio a sinistra
  (`minmax(360px, 0.78fr)`) e pianta a destra (`1.22fr`), divise da un
  filetto, alte quanto la finestra. Il cartiglio finisce con una riga di celle
  (esempio, scala, revisione) appoggiata al fondo.
- **Sezioni**: ogni sezione è una tavola che parte da un filetto in alto.
  L'intestazione sta a sinistra, max 62ch.
- **Griglie interne**: tabella + citazione (`1.6fr / 1fr`), due modi d'uso in
  un riquadro diviso (`1fr / 2fr`), passi a tre colonne (numero 72px, testo,
  comando), download + note (`1fr / minmax(280px, 0.6fr)`) con pannello
  appiccicoso.
- **Sotto 1100px** tutto va su una colonna; i pannelli appiccicosi diventano
  statici.
- **Sotto 760px** la navigazione sparisce (restano lingua e tema), l'etichetta
  sulla pianta e la linea di richiamo spariscono, i testi della pianta
  crescono, i passi passano a due colonne (44px).
- **Sotto 1440px** spariscono i richiami sulle schermate.

### Named Rules
**La regola della cornice.** Si separa con un filetto da 1px, non con fondi,
card o spazi vuoti enormi. La griglia a quadretti sta solo dietro la pianta.

## Elevation & Depth

Il foglio è piatto. La profondità viene dai filetti e dal tono di
`sheet-2`. Un'unica ombra morbida, `--shadow`, solleva le poche cose che
stanno *sopra* il foglio: il bottone di download, l'etichetta sulla pianta,
le schermate dell'app.

### Shadow Vocabulary
- **Appoggiato** (`0 1px 2px rgb(16 32 26 / 0.08), 0 14px 32px -12px rgb(16 32 26 / 0.22)`;
  scuro `0 1px 2px rgb(0 0 0 / 0.3), 0 18px 40px -14px rgb(0 0 0 / 0.55)`):
  bottone primario, etichetta della pianta, schermate.

### Named Rules
**La regola del foglio piatto.** Pannelli, chip, tabelle e celle non hanno
ombra. Se non è appoggiato sopra il disegno, è disegnato sul foglio.

## Shapes

Angoli piccoli, da strumento di disegno. Il filetto conta più del raggio.

- `hair` (3px): richiami sulle schermate.
- `sm` (4px): chip, etichetta della pianta.
- `md` (6px): bottoni, bottone tema, blocchi di codice, icona del marchio,
  messaggio d'errore.
- `lg` (8px): pannelli e riquadri (note di versione, modi d'uso, telefono).
- `shot` (10px) e `phone` (22px): solo le schermate desktop e telefono.
- Cerchio pieno solo per il segno di prospetto («A»), alto 34px, bordo 2px.

Bordi da 1px in `rule`; 1.5–2px in `ink-strong` solo per ciò che va letto
come segno sul disegno (etichetta, segno di prospetto, intestazioni di
tabella). Le icone sono SVG a tratto unico da 1.75, estremi arrotondati.

## Components

### Buttons
- **Shape:** angoli lievi (6px).
- **Primary:** fondo `btn`, testo `btn-text`, Inter 600 1.0625rem, 16px 24px,
  icona di download a sinistra, ombra «appoggiato». Uno per pagina: scarica
  per il sistema rilevato.
- **Hover / Focus:** fondo `btn-hover` in 150ms `--ease`; alla pressione
  scende di 1px; fuoco = anello ambra 2px, scostato 3px.
- **Quiet:** testo `ink-strong` 500, sottolineato in `rule`, sottolineatura
  ambra al passaggio, freccia a destra. Per «altri sistemi» e i rimandi.

### Chips
- **Style:** titoli da chiedere alla casa. Inter 500 0.875rem, `muted`, bordo
  1px `rule`, fondo trasparente, 4px.
- **State:** al passaggio bordo `ink`, testo `text`; premuto
  (`aria-pressed`) fondo `ink-strong`, testo `sheet`. Senza JavaScript non si
  vedono.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** `sheet-2`.
- **Shadow Strategy:** nessuna (vedi Elevation & Depth).
- **Border:** 1px `rule`.
- **Internal Padding:** `clamp(20px, 2.4vw, 32px)`.

### Navigation
- **Barra in alto:** marchio (icona dell'app 28px + «Bookeeper» in Lora 600)
  a sinistra; link Inter 500 0.9375rem in `muted` a destra; lingua e bottone
  tema dopo un filetto verticale. Al passaggio il link va in `text`,
  sottolineato in ambra. Sotto 760px restano solo marchio, lingua e tema.
- **Bottone tema:** 40px, bordo `rule`, 6px; al passaggio bordo `ink` e fondo
  `sheet-2`. Luna nel chiaro, sole nello scuro.

### Pianta della casa (firma)
La pianta di una casa d'esempio, su griglia da 20px. Muri a doppio tratto
con tratteggio (`wall` su `hatch-bg`), porte con arco tratteggiato in `ink`,
arredi in `ink` al 55%, nomi delle stanze in label maiuscola `muted`, quote
in `ink`. Il mobile trovato si riempie d'ambra, la stanza prende il velo
d'ambra, il percorso dalla porta è una linea ambra da 4px.

### Etichetta della pianta
Il cartellino che nomina stanza (label `muted`), mobile (Lora 500 1.0625rem)
e ripiano (Inter 600 in `found-ink`). Fondo `sheet`, bordo 1.5px
`ink-strong`, 4px, ombra «appoggiato». Collegata al mobile da una linea di
richiamo. Sotto 760px sparisce.

### Prospetto del mobile
Sotto la pianta, separato da un filetto: il mobile visto di fronte, nel suo
legno, con i ripiani numerati e il dorso cercato acceso in ambra. Accanto, il
segno di prospetto «A» e il nome del mobile in Lora.

### Cartiglio
La riga di celle in fondo alla prima colonna: label maiuscola `muted`, celle
divise da filetti, l'ultima allineata a destra. Dice che la casa è un esempio,
la scala, la versione.

### Tabelle
Didascalia in Title Lora a sinistra; intestazioni in label sopra un filetto
1.5px `ink-strong`; righe divise da filetti `rule`; prima colonna Inter 600
in `text`, le altre in `muted`. La riga del file giusto per il visitatore
prende il velo d'ambra e il filetto ambra.

### Passi
Elenco numerato: numero in Lora 500 2.75rem in `ink`, titolo in Lora 1.375rem,
spiegazione in `muted`, comando in un blocco di codice nella terza colonna.
Filetti tra i passi.

### Blocchi di codice
Fondo `code`, bordo 1px `rule`, 6px, 12px 16px, mono 500.

## Do's and Don'ts

### Do:
- **Do** tenere ogni colore nei token di `site.css`, con il valore scuro
  accanto a quello chiaro.
- **Do** separare con filetti da 1px in `rule`, dentro la cornice del foglio.
- **Do** usare l'ambra solo per percorso, oggetto trovato, fuoco, selezione e
  ciò che è «tuo».
- **Do** scrivere titoli, domanda e citazioni in Lora 500 (corsivo per titoli
  di libri e citazioni) e tutto il resto in Inter.
- **Do** tenere ogni animazione dentro `prefers-reduced-motion:
  no-preference`, con `--ease` `cubic-bezier(0.22, 1, 0.36, 1)` e 150ms per
  i passaggi di stato.
- **Do** mostrare l'app con schermate vere, bordo 1px `rule`, 10px (22px per
  il telefono), ombra «appoggiato».

### Don't:
- **Don't** usare un fondo crema o bianco caldo nel tema chiaro.
- **Don't** mettere un'etichetta maiuscola sopra un titolo come soprattitolo.
- **Don't** usare l'ambra come decorazione o come colore di titoli e fondi.
- **Don't** costruire sezioni a card ripetute, a fasce colorate o con ombre
  su pannelli e chip.
- **Don't** aggiungere animazioni d'autore oltre alla linea disegnata dalla
  porta allo scaffale.
- **Don't** portare i legni dei mobili fuori da mobili e dorsi.
