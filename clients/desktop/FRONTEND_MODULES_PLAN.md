# Frontend Modules Plan — clients/desktop

> Piano architetturale dei moduli Vue del client desktop Wails. Vive nel repo per
> resistere a compaction e onboarding nuovi contributor.

## Principi guida (manutenibilità)

1. **Un modulo = una cartella** sotto `src/modules/<dominio>/` con dentro views,
   components, composables, store dedicato, types e CSS.
2. **CSS esterno** (`*.css` accanto al `.vue`) appena un componente supera ~150
   righe di `<style>`. Niente CSS in-line oltre micro-tweak.
3. **Componenti < 250 righe**. Sopra, splittare in sub-components co-locati.
4. **Logica fuori dal template**: composables (`use<Feature>.ts`) per stato,
   fetching, side-effects. Le `views/` orchestrano, non implementano.
5. **API isolate** in `src/lib/api/` (un client mTLS condiviso + endpoint per
   dominio). Mai fetch diretti dai componenti.
6. **Types-first**: ogni modulo espone `types.ts`. I DTOs lato server vivono in
   `src/lib/api/dto/` generati (in futuro) da OpenAPI.
7. **Routing per modulo**: ogni modulo esporta le sue route da
   `modules/<x>/routes.ts`, aggregate in `router/index.ts`.
8. **Store per modulo** (Pinia setup-style) — niente mega-store globale. Stato
   cross-modulo solo via `stores/auth.ts` e `stores/ui.ts`.

## Struttura target

```
src/
├─ App.vue                    # router-view nudo
├─ main.ts                    # bootstrap (Pinia, Router, PrimeVue, theme)
├─ style.css                  # reset, fonts, focus globali
│
├─ theme/
│  └─ index.ts                # BookeeperPreset (Aura + brand tokens)
│
├─ router/
│  ├─ index.ts                # createRouter + aggregazione route
│  └─ guards.ts               # auth guard, layout guard
│
├─ stores/                    # store globali condivisi
│  ├─ ui.ts                   # tema, sidebar collapse
│  └─ auth.ts                 # sessione utente, token, profilo
│
├─ lib/                       # infrastruttura cross-modulo
│  ├─ api/
│  │  ├─ client.ts            # axios/fetch + mTLS + interceptors
│  │  ├─ dto/                 # tipi DTO server (generati)
│  │  └─ endpoints/           # un file per risorsa REST
│  │     ├─ auth.ts
│  │     ├─ books.ts
│  │     ├─ loans.ts
│  │     └─ ...
│  ├─ keystore.ts             # cert/JWT su disco (Wails bridge)
│  ├─ mdns-discovery.ts       # ricerca server in LAN
│  ├─ pairing.ts              # QR pairing mobile
│  ├─ format.ts               # date, numeri, ISBN
│  └─ validators.ts           # schemi (Zod) condivisi
│
├─ composables/               # composables generici (cross-modulo)
│  ├─ useAsync.ts
│  ├─ useDebouncedRef.ts
│  ├─ useToast.ts             # wrapper PrimeVue useToast
│  └─ useShortcuts.ts         # binding ⌘K, ⌘/, ecc.
│
├─ components/                # componenti UI generici (no business)
│  ├─ PlaceholderView.vue
│  ├─ EmptyState.vue
│  ├─ ConfirmDialog.vue
│  ├─ DataTable.vue           # wrapper PrimeVue DataTable + filtri standard
│  └─ icons/                  # eventuali icone custom (SVG)
│
├─ layouts/                   # chrome dell'app (no contenuto pagina)
│  ├─ AppShell.vue
│  ├─ AppShell.css
│  ├─ AppSidebar.vue
│  ├─ AppTopbar.vue
│  └─ nav-config.ts
│
├─ views/                     # route "speciali" senza modulo proprio
│  ├─ LoginView.vue
│  └─ LoginView.css
│
└─ modules/                   # ⭐ qui vive la logica di dominio
   ├─ books/
   │  ├─ routes.ts
   │  ├─ store.ts             # Pinia setup store (catalogo, filtri, paginazione)
   │  ├─ types.ts
   │  ├─ composables/
   │  │  ├─ useBookSearch.ts
   │  │  └─ useBookForm.ts
   │  ├─ components/
   │  │  ├─ BookCard.vue
   │  │  ├─ BookGrid.vue
   │  │  ├─ BookListRow.vue
   │  │  ├─ BookFiltersDrawer.vue
   │  │  ├─ BookEditDialog.vue
   │  │  └─ IsbnScanInput.vue
   │  └─ views/
   │     ├─ BooksListView.vue        # default route /books
   │     ├─ BookDetailView.vue       # /books/:id
   │     └─ BookEditView.vue         # /books/:id/edit
   │
   ├─ loans/
   │  ├─ routes.ts
   │  ├─ store.ts
   │  ├─ types.ts
   │  ├─ composables/useLoanReturn.ts
   │  ├─ components/
   │  │  ├─ LoanRow.vue
   │  │  ├─ LoanStatusBadge.vue
   │  │  └─ LoanCreateDialog.vue
   │  └─ views/
   │     ├─ LoansListView.vue        # /loans (attivi + scaduti)
   │     └─ LoanHistoryView.vue      # /loans/history
   │
   ├─ wishlist/
   │  ├─ routes.ts
   │  ├─ store.ts
   │  ├─ components/
   │  │  ├─ WishlistItem.vue
   │  │  └─ WishlistAddDialog.vue
   │  └─ views/WishlistView.vue
   │
   ├─ stats/
   │  ├─ routes.ts
   │  ├─ types.ts
   │  ├─ composables/useStatsData.ts
   │  ├─ components/
   │  │  ├─ StatCard.vue
   │  │  ├─ ReadingHeatmap.vue
   │  │  ├─ GenreBreakdownChart.vue
   │  │  └─ TimelineChart.vue
   │  └─ views/StatsView.vue
   │
   ├─ shelves/                       # ⭐ visualizzazione fisica della libreria
   │  ├─ routes.ts                   # /shelves, /shelves/:id
   │  ├─ store.ts                    # CRUD scaffali, drag&drop ordinamento
   │  ├─ types.ts                    # Shelf, ShelfRow, ShelfConfig, ShelfBook
   │  ├─ composables/
   │  │  ├─ useShelfLayout.ts        # calcola layout SVG (rows × slots)
   │  │  ├─ useShelfFill.ts          # % riempimento totale + per mensola
   │  │  ├─ useShelfEditor.ts        # editing inline (rename, slot count)
   │  │  └─ useShelfDnd.ts           # drag book → slot (Phase 6+)
   │  ├─ components/
   │  │  ├─ ShelfSvg.vue             # singolo scaffale SVG interattivo
   │  │  ├─ ShelfBookSpine.vue       # dorso libro <rect> con tooltip
   │  │  ├─ ShelfRowSvg.vue          # singola mensola (<g> con slots)
   │  │  ├─ ShelfFillBar.vue         # barra % riempimento (header card)
   │  │  ├─ ShelfHeader.vue          # nome editabile inline + menu (rinomina/elimina)
   │  │  ├─ ShelfConfigDialog.vue    # mensole, slot/mensola, colore, icona
   │  │  ├─ ShelfCreateButton.vue    # FAB / card "+ Nuovo scaffale"
   │  │  └─ ShelvesGrid.vue          # griglia responsive di ShelfSvg
   │  └─ views/
   │     ├─ ShelvesDashboardView.vue # /shelves — overview SVG di tutti
   │     └─ ShelfDetailView.vue      # /shelves/:id — vista ingrandita + libri
   │
   ├─ devices/
   │  ├─ routes.ts
   │  ├─ store.ts                    # device list, revoche
   │  ├─ components/
   │  │  ├─ DeviceCard.vue
   │  │  └─ PairingQrDialog.vue
   │  └─ views/
   │     ├─ DevicesListView.vue      # /devices
   │     └─ PairMobileView.vue       # /devices/pair
   │
   ├─ audit/
   │  ├─ routes.ts
   │  ├─ components/AuditRow.vue
   │  └─ views/AuditView.vue         # /audit (in Settings drawer)
   │
   └─ settings/
      ├─ routes.ts
      ├─ components/
      │  ├─ SettingsSection.vue
      │  ├─ ServerInfoPanel.vue
      │  ├─ BackupPanel.vue
      │  └─ ThemePicker.vue
      └─ views/
         ├─ SettingsView.vue         # /settings (hub)
         ├─ SettingsAccountView.vue  # /settings/account
         ├─ SettingsBackupView.vue   # /settings/backup
         └─ SettingsAdvancedView.vue # /settings/advanced
```

## Convenzioni di styling

- **CSS esterno** quando `<style>` > 150 righe → file `Component.css` co-located,
  importato dal `<script setup>` con `import './Component.css'`. NON usare
  `<style scoped>` per il file esterno (le classi BEM evitano collisioni).
- **BEM** (`block__element--modifier`) per componenti complessi e layout.
- **Tokens PrimeVue** (`var(--p-surface-*)`, `var(--p-primary-*)`) per colori e
  superfici: dark mode arriva gratis. Mai hex hard-coded fuori dal preset.
- **Spacing rhythm** 4/8 px: `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`, `2rem`.
- **Font hierarchy**: Inter (UI), Lora (titoli editoriali h1/h2 + brand).
- **Transition tokens**: `150ms` micro, `200–300ms` layout. `cubic-bezier(.2,.8,.2,1)` default.

## Routing — modello finale

`router/index.ts` aggrega:
```ts
import auth from '@/modules/auth/routes';   // futuro (split LoginView)
import books from '@/modules/books/routes';
import loans from '@/modules/loans/routes';
// ...
const routes = [
    ...auth,                       // public, no shell
    { path: '/', component: AppShell, children: [...books, ...loans, ...] }
];
```

`router/guards.ts` aggancia `beforeEach`:
- redirect a `/login` se non autenticato e route non `meta.public`
- preserva `redirect` query per ritornare al deep link post-login

## Roadmap implementativa (post-bootstrap)

| Fase | Modulo | Output |
|------|--------|--------|
| **1** ✅ | bootstrap, theme, layouts | shell + login |
| **2** | `lib/api`, `stores/auth`, `lib/keystore` | login reale, mTLS, route guard |
| **3** | `modules/books` (lista + dettaglio + edit) | CRUD libri + ricerca FTS |
| **4** | `modules/shelves` (SVG dashboard) | scaffali interattivi + assegnazione libri |
| **5** | `modules/loans` | gestione prestiti + scadenze |
| **6** | `modules/wishlist` | wishlist + quick-add |
| **7** | `modules/devices` + pairing QR | mobile pairing flow |
| **8** | `modules/stats` | dashboard analytics |
| **9** | `modules/settings` + `modules/audit` | gestione + audit log |
| **10** | i18n, accessibility audit, perf pass | release candidate |

## Modulo `shelves` — visualizzazione SVG interattiva

> Rende fisicamente la libreria dell'utente come scaffali SVG vettoriali. Ogni
> scaffale = card con grafica dinamica: mensole orizzontali, "dorsi libro"
> renderizzati come `<rect>`, percentuale di riempimento visibile sia
> graficamente (slot occupati vs vuoti) sia numericamente (badge in header).

### Modello dati

```ts
// modules/shelves/types.ts
export interface ShelfConfig {
    rows: number;              // numero di mensole (default 5, range 1–12)
    slotsPerRow: number;       // slot per mensola (default 20, range 5–60)
    color: string;             // token semantico: 'sage' | 'terracotta' | ...
    icon?: string;             // pi-icon opzionale per identificare lo scaffale
}

export interface Shelf {
    id: string;
    name: string;              // editabile inline
    config: ShelfConfig;
    /** Capacità derivata: rows * slotsPerRow. */
    capacity: number;
    /** Numero libri attualmente assegnati a questo scaffale. */
    bookCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface ShelfBook {
    bookId: string;
    shelfId: string;
    rowIndex: number;          // 0-based
    slotIndex: number;         // 0-based
    /** Snapshot per render veloce senza JOIN libri. */
    title: string;
    spineColor: string;        // hash dal titolo o impostato manualmente
    spineWidth: 1 | 2 | 3;     // largezza in slot (libri spessi)
}
```

### Layout SVG (calcolo)

`useShelfLayout(shelf)` produce dimensioni viewBox basate su config:
- `slotW = 14`, `slotH = 56`, `gap = 1`, `framePad = 12`
- `viewBox = "0 0 (slotsPerRow*slotW + 2*framePad) (rows*(slotH+gap) + 2*framePad)"`
- Tutti i numeri in unità SVG → la card scala fluidamente con `width="100%"`
- `preserveAspectRatio="xMidYMid meet"` per mantenere proporzioni

### Struttura rendering

```
ShelfSvg (root <svg>)
├─ <rect class="shelf__frame">                 # cornice scaffale
├─ <g class="shelf__row" data-row="0">
│   ├─ <line class="shelf__plank">             # mensola
│   ├─ ShelfBookSpine × N                      # libri (occupati)
│   └─ <rect class="shelf__slot--empty">       # slot vuoti
├─ <g class="shelf__row" data-row="1"> …
└─ <text class="shelf__capacity-label">75%</text>  # opzionale (overlay angolo)
```

### % riempimento (visiva + numerica)

`useShelfFill(shelf, books)`:
- `total = capacity`
- `filled = books.filter(b => b.shelfId === shelf.id).length`
- `pct = filled / total`
- Restituisce: `{ pct, filled, total, perRow: number[] }` (riempimento per mensola)

Visualizzazione:
1. **Per slot**: `<rect>` riempito con `--p-primary-500` se occupato, `--p-surface-200` se vuoto.
2. **Header card**: `ShelfFillBar` mostra barra orizzontale `0–100%` + label `12/100 (12%)`.
3. **Soglie semantiche**: `pct < 0.5` neutro, `0.5–0.85` warning ambra, `> 0.85` danger.
4. **Per-mensola**: gradient sottile sotto la mensola che mostra fill della singola riga.

### Interazioni richieste

| Azione | Trigger | UI |
|--------|---------|-----|
| Crea scaffale | click `ShelfCreateButton` | apre `ShelfConfigDialog` (nome + rows + slotsPerRow + colore) |
| Rinomina | click sul titolo `ShelfHeader` | input inline contentEditable, blur o Enter conferma |
| Riconfigura | menu `⋯` → "Modifica" | `ShelfConfigDialog` precompilato |
| Elimina | menu `⋯` → "Elimina" | `ConfirmDialog` (avviso se contiene libri) |
| Vedi dettaglio | click sull'SVG | naviga a `/shelves/:id` (vista ingrandita) |
| Hover dorso libro | mouseover `<rect>` | tooltip con titolo, autore, anno (PrimeVue Tooltip su `<g>`) |
| Click dorso libro | click `<rect>` | naviga a `/books/:id` |
| Riordina libri | drag & drop dorso | Phase 6+ (`useShelfDnd`) |
| Sposta libro tra scaffali | drag dorso → altro scaffale | Phase 6+ |

### Accessibilità SVG

- `<svg role="img" :aria-label="`Scaffale ${name}: ${filled}/${total} libri`">`
- Ogni `ShelfBookSpine` ha `<title>` figlio (tooltip nativo SR) e `tabindex="0"` se cliccabile
- Focus ring su spine via `outline` SVG-compatibile (`stroke` dinamico su `:focus-visible`)
- Alternativa testuale: `ShelfDetailView` mostra anche tabella libri per screen reader
- Rispetto `prefers-reduced-motion`: niente entrance stagger, solo fade (200ms)

### Performance

- `ShelfSvg` rendering è O(rows × slotsPerRow); con default 5×20 = 100 elementi → trascurabile
- Limit hard: capacity max **720 slot** per scaffale (12×60), warning UI sopra 400
- Su `ShelvesDashboardView` con N scaffali, virtualizzare se N > 30 (raro caso d'uso)
- `<rect>` libri usano `key="bookId"` per minimizzare patch di Vue
- Animazione fill update: `transition: fill 200ms ease` sul singolo slot (no width animations)

### File CSS dedicati

- `ShelfSvg.css` — frame, plank, slot, spine (con varianti `--occupied` / `--empty`)
- `ShelvesGrid.css` — layout grid responsive (auto-fill `minmax(280px, 1fr)`)
- `ShelfConfigDialog.css` — solo se supera 150 righe di stili

### API endpoints attesi (backend Phase 4)

```
GET    /api/v1/shelves                  # list con bookCount denormalizzato
POST   /api/v1/shelves                  # crea
PATCH  /api/v1/shelves/:id              # rinomina / riconfigura
DELETE /api/v1/shelves/:id              # opzionale ?reassign=<otherId>
GET    /api/v1/shelves/:id/books        # libri assegnati con rowIndex/slotIndex
PATCH  /api/v1/books/:id/shelf          # assegna { shelfId, rowIndex, slotIndex }
```



- View > 250 righe → splittare componenti co-located in `components/`.
- Composable > 200 righe → splittare per responsabilità.
- Store > 300 righe → splittare in store separati per sotto-dominio o usare
  azioni in file `store/actions.ts` separato.
- Più di 3 import dallo stesso modulo esterno → considerare facade in
  `modules/<x>/index.ts`.

## Naming

- Componenti: `PascalCase.vue` (es. `BookCard.vue`, `LoanStatusBadge.vue`).
- Composables: `useCamelCase.ts` (es. `useBookSearch.ts`).
- Store: `store.ts` o `<feature>.store.ts` se più di uno per modulo.
- Tipi: `types.ts` (modulo) o `types/<entity>.ts` (se più entità).
- Eventi: `kebab-case` con verbo (`@book-saved`, `@filters-changed`).

## File da creare ai prossimi step (Phase 2 — auth reale)

Priorità per sbloccare login funzionante end-to-end:

1. `src/lib/api/client.ts` — fetch wrapper (cert client + JWT bearer + retry).
2. `src/lib/keystore.ts` — Wails bindings: `SaveCert`, `LoadCert`, `Wipe`.
3. `src/lib/api/endpoints/auth.ts` — `login`, `refresh`, `logout`, `pair`.
4. `src/stores/auth.ts` — Pinia: `user`, `token`, `login()`, `logout()`,
   `restore()` (chiamato in `main.ts` prima del mount).
5. `src/router/guards.ts` — `beforeEach` con redirect a `/login?redirect=...`.
6. Modifica `LoginView.submit()` per usare lo store reale.
