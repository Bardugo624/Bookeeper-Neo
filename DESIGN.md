# Design — Bookeeper Neo (client desktop)

Sistema visivo del client desktop (`clients/desktop/frontend`). Registro:
**product** — il design serve il compito, la familiarità è un pregio.
Direzione: **biblioteca moderna** — editoriale, caldo, preciso; profondità e
micro-interazioni contemporanee. Il libro è il protagonista.

## Fondazioni

### Colore

- **Primary**: verde-salvia `#4d8369` (scala 50–950 in
  [theme/index.ts](clients/desktop/frontend/src/theme/index.ts), preset
  PrimeVue Aura). Identico in light e dark (identità prima del default Aura).
- **Neutri**: zinc caldo (`surface-50 #fbfaf8` → `950 #0c0b0a`).
- **Strategia**: restrained — accento primario solo per azioni, selezione e
  stato; i colori pieni vivono nei legni degli scaffali e nei dorsi.
- **Colori scaffale** (`SHELF_COLOR_OPTIONS`): salvia, terracotta, notte,
  prugna, ambra, grafite. Stessa famiglia usata dai placeholder copertina
  (`CLOTH_TONES` in BookCover).

### Token condivisi — `src/theme/tokens.css`

Prefisso `--bk-`. Unica fonte per superfici light/dark: i componenti usano
`--bk-surface/--bk-border/--bk-text-*` e NON scrivono blocchi `html.dark`
duplicati (restano solo eccezioni puntuali).

- **Superfici**: `--bk-bg` (fondo) · `--bk-surface` (card) ·
  `--bk-chrome` (sidebar/topbar, secondo neutro caldo) · `--bk-inset`
  (incassi: track, nicchie) · `--bk-border`, `--bk-border-strong`.
- **Testo**: `--bk-text-strong / text / text-muted / text-faint`.
- **Ombre** (tinte calde, non nero puro): `--bk-shadow-1/2/3` +
  `--bk-shadow-book` e `--bk-shadow-book-lift` (ombra da volume fisico).
- **Radius**: `--bk-radius-sm 8 / radius 12 / radius-lg 16`.
- **Z-index semantici**: sticky 100 → dropdown 1000 → overlay 1100 →
  modal 1200 → toast 1300 → tooltip 1400.

### Tipografia

- **Inter** (UI: label, corpo, dati) + **Lora** (titoli, valori editoriali).
  Contrasto serif/sans deliberato; scelta confermata dall'utente.
- Scala fissa rem (registro product); numeri sempre `tabular-nums`.
- `text-wrap: balance` su h1–h4, `pretty` sui paragrafi (globale).

### Motion

Token: `--bk-dur-fast 150ms` (feedback) · `--bk-dur 200ms` (stato) ·
`--bk-dur-slow 280ms` (entrance) · easing `--bk-ease` (out-quart) e
`--bk-ease-snappy` (out-quint). Regole:

- Solo transform/opacity/filter (mai `width`/layout: le barre animano con
  `scaleX`, origin left).
- Entrance condivisa `bk-rise` (anima solo `from{}` → default visibile);
  stagger via `--i` sull'item, cap ≤ ~400ms totali.
- Uscite ~75% delle entrate. `prefers-reduced-motion` azzerato globalmente
  in style.css.
- Press feedback globale sui bottoni PrimeVue: `scale(0.97)` su `:active`.

## Vocabolario componenti

- **Shell**: sidebar+topbar su `--bk-chrome`; voce attiva = pill su
  `--bk-surface` con icona accesa in primary (niente barre laterali);
  cambio rotta = fade+rise 8px.
- **Copertine (BookCover)**: radius asimmetrico (dorso 2px / taglio 5px),
  overlay piega-dorso + luce ambiente anche sulle cover reali,
  `--bk-shadow-book`; placeholder = tinta `CLOTH_TONES` deterministica +
  iniziale in Lora. Hover (in BookCard): la copertina si solleva
  (`translateY(-3px) rotate(-0.5deg)` + shadow-lift), la card resta ferma.
- **Scaffali (ShelfSvg)**: mobile vero — cornice nel colore scaffale con
  overlay "venatura", fondale scurito (darken 0.45), mensole con spessore e
  ombra portata, dorsi bottom-aligned con altezza variabile deterministica
  (86–100%) e gradiente di cilindricità condiviso; slot vuoti a
  `rgb(255 255 255 / 0.12)`, hover primario; hover dorso = si sfila
  (-2.5px + brightness). Entrance a stagger per colonna (14ms, cap).
  Gradienti SVG con id per-istanza (evita collisioni multi-card).
- **Stato nelle card (Loans/Wishlist)**: MAI side-stripe; lo stato tinge
  l'intero bordo (`color-mix` col border token) + velatura di fondo solo per
  overdue/priorità alta. Il Tag resta l'indicatore esplicito.
- **KPI (StatCard)**: registro editoriale — label con glifo piccolo colorato
  per ruolo, valore grande in Lora, count-up 600ms out-quint al mount
  (immediato con reduced-motion). Niente icon-pill hero-metric.
- **Barre di riempimento**: track su `--bk-inset`, indicatore `scaleX`
  (compositor), soglie semantiche ok/warn/danger.

## Anti-pattern (vietati qui)

Side-stripe border-left colorati · gradient text · glassmorphism decorativo ·
hero-metric template · animazioni su proprietà di layout · dark mode
duplicato per componente quando i token bastano.
