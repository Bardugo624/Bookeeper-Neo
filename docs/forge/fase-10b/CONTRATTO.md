# Contratto del run 10B: il lettore

Prima di ogni task leggi:
- `docs/superpowers/specs/2026-11-28-lettore-design.md` e gli stati in `docs/superpowers/specs/2026-11-28-lettore/`;
- la parte «Fase 10B» di `docs/superpowers/specs/2026-11-27-ebook-design.md`;
- `docs/forge/fase-10b/request.md` e il contratto della 10A, `docs/forge/fase-10a/CONTRATTO.md`;
- per le task d'interfaccia, il brief `apps/desktop/.impeccable/surfaces/src-modules-reader-readerview-tsx.md`;
- `PRODUCT.md` e `DESIGN.md`.

Qui ci sono i valori fissati e le interfacce che le task si scambiano. Dove un valore non è scritto, decidi tu e scrivilo nel rapporto.

## Il pacchetto `@bookeeper/reader`

- **Cartella:** `packages/reader`, `"private": true`, `"type": "module"`, versione uguale agli altri pacchetti (2.2.0), test con Vitest e jsdom come `packages/ui`.
- **Ingressi** (`exports` in `package.json`), ognuno con il suo `index.ts`:

  | Ingresso | Cartella | Chi la riempie |
  |---|---|---|
  | `@bookeeper/reader/engine` | `src/engine/` | `reader-engine` |
  | `@bookeeper/reader/frame` | `src/frame/` | `reader-engine` |
  | `@bookeeper/reader/vite` | `src/vite/` | `reader-engine` |
  | `@bookeeper/reader/i18n` | `src/i18n/` | `reader-engine` |
  | `@bookeeper/reader/model` | `src/model/` | `reader-model` |
  | `@bookeeper/reader/view` | `src/ui/view/` | `reader-view` |
  | `@bookeeper/reader/panel` | `src/ui/panel/` | `reader-panel` |
  | `@bookeeper/reader/look` | `src/ui/look/` | `reader-look` |
  | `@bookeeper/reader/data` | `src/data/` | `reader-sync` |
  | `@bookeeper/reader/app` | `src/app/` | `reader-app` |

  `reader-engine` crea tutti gli ingressi; quelli delle task successive partono come `export {};`.
- **Testi:** il pacchetto usa `t` di `@bookeeper/i18n` con chiavi intere (`'reader.top.back'`), attraverso `useReaderT()` di `@bookeeper/reader/i18n`. La lingua arriva da `<ReaderLocale locale="it">`. Ogni task che aggiunge chiavi le mette in italiano e in inglese.
  - Namespace: `reader` (`reader-view` e `reader-app`), `rpanel` (`reader-panel`), `rlook` (`reader-look`), `dreader` (computer), `mreader` (telefono).
  - `src/translationKeys.test.ts` del pacchetto controlla, come quello del telefono, che ogni chiave `reader.`, `rpanel.` e `rlook.` usata nel codice esista nelle due lingue.
- **Colori letterali:** solo in `src/model/themeColors.ts` e `src/model/highlightColors.ts`, che sono dati come i colori dei mobili. Un test di stile del pacchetto vieta i colori letterali altrove, come `packages/ui/src/styleCheck.ts`.

## foliate-js e pdf.js

- **Copia:** `packages/reader/vendor/foliate-js/`, senza modifiche, dal commit `78914aef4466eb960965702401634c2cb348e9b1` di `https://github.com/johnfactotum/foliate-js` (file presi da `https://raw.githubusercontent.com/johnfactotum/foliate-js/<commit>/<percorso>`).
  - **I file:** `view.js`, `epub.js`, `epubcfi.js`, `paginator.js`, `fixed-layout.js`, `progress.js`, `overlayer.js`, `text-walker.js`, `search.js`, `footnotes.js`, `mobi.js`, `fb2.js`, `comic-book.js`, `pdf.js`, `vendor/zip.js`, `vendor/fflate.js`, e tutta `vendor/pdfjs/` (pdf.js 5.5.207: `pdf.mjs`, `pdf.worker.mjs`, i due CSS, `cmaps/` e `standard_fonts/`).
  - **Licenze:** `LICENSE` di foliate-js e quelle di pdf.js, zip.js e fflate.
  - `VENDOR.md` dice commit, data, file presi e come aggiornarli.
- **Come si servono:** file statici sotto `/reader/foliate-js/`, con i percorsi relativi intatti.
  - `foliateAssets()` di `@bookeeper/reader/vite` è un plugin di Vite che li serve durante lo sviluppo e li copia in `dist/reader/foliate-js/` nella build.
  - Il motore li carica con `import('/reader/foliate-js/view.js')`.
- **Errore alla chiusura:** dopo `destroy()` un `ResizeObserver` di foliate-js lancia `Cannot destructure property 'style' of 'el'`. Il motore chiude in un ordine che lo evita, oppure lo intercetta solo lui. Un test prova che chiudere non lascia errori.

## Il recinto

- **La pagina del motore:** `reader-frame.html` nella radice di ogni app (`apps/desktop/`, `apps/mobile/`), seconda entrata di Vite (`build.rollupOptions.input`). Carica `src/readerFrame.ts`, che chiama `bootFrame()` di `@bookeeper/reader/frame`.
- **La CSP**, in un `<meta http-equiv="Content-Security-Policy">`, alla lettera:

  ```
  default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' blob:; img-src blob: data:; font-src 'self' blob: data:; media-src blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'
  ```

- **La cornice:** la vista del lettore la monta come `<iframe src="/reader-frame.html">` con un `title` tradotto. foliate-js crea dentro le cornici del libro, che ereditano la CSP.
- **Il server** risponde a `/reader-frame.html` con `X-Frame-Options: SAMEORIGIN` (oggi è `DENY` per tutto). Il resto non cambia.

## Il protocollo fra vista e motore

Ogni messaggio è `{ bk: 'reader', v: 1, msg }`. Chi riceve controlla `event.origin === location.origin` e la finestra d'origine, e ignora il resto. I tipi stanno in `src/engine/protocol.ts`:

```ts
export type Target = { cfi: string } | { fraction: number } | { href: string };
export interface Rect { x: number; y: number; width: number; height: number } // px CSS, rispetto alla cornice
export interface TocItem { label: string; href: string; fraction: number | null; children: TocItem[] }
export interface Relocation {
  cfi: string; fraction: number; sectionIndex: number; sectionFraction: number;
  tocHref: string | null; atStart: boolean; atEnd: boolean;
}
export interface Mark { id: string; cfi: string; color: HighlightColor; hasNote: boolean }
export interface FrameLayout {
  colors: { page: string; ink: string; link: string; veils: Record<HighlightColor, string> };
  font: FontChoice; fontSize: number; lineHeight: 1.4 | 1.6 | 1.8;
  margins: 'narrow' | 'medium' | 'wide'; justify: boolean; hyphenate: boolean;
  publisherStyles: boolean; flow: 'paginated' | 'scrolled'; twoPages: boolean;
  animated: boolean; pdfFit: 'width' | 'page';
}
export type ToFrame =
  | { type: 'open'; file: Blob; name: string; at: Target | null; layout: FrameLayout }
  | { type: 'layout'; layout: FrameLayout }
  | { type: 'next' } | { type: 'prev' } | { type: 'goto'; target: Target }
  | { type: 'marks'; marks: Mark[] }
  | { type: 'search'; id: number; query: string } | { type: 'search-stop' }
  | { type: 'clear-selection' } | { type: 'close' };
export type FromFrame =
  | { type: 'ready' }
  | { type: 'opened'; toc: TocItem[]; sectionFractions: number[]; sectionChars: number[]; format: string; title: string | null }
  | { type: 'relocate'; at: Relocation }
  | { type: 'selection'; cfi: string; text: string; rect: Rect } | { type: 'selection-cleared' }
  | { type: 'mark-click'; id: string; rect: Rect }
  | { type: 'tap'; zone: 'start' | 'center' | 'end' }
  | { type: 'key'; key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }
  | { type: 'search-result'; id: number; cfi: string; fraction: number; sectionLabel: string | null; pre: string; match: string; post: string }
  | { type: 'search-progress'; id: number; fraction: number } | { type: 'search-done'; id: number }
  | { type: 'closed' } | { type: 'error'; code: 'open_failed' | 'unsupported_format' };
```

- `HighlightColor` e `FontChoice` vengono da `src/model`. Per non creare un giro, `reader-engine` li dichiara in `src/engine/protocol.ts` e `src/model` li riesporta.
- **La classe `Engine`** (`@bookeeper/reader/engine`) parla al motore dalla vista:

  ```ts
  class Engine {
    constructor(iframe: HTMLIFrameElement);
    ready(): Promise<void>;
    open(file: Blob, name: string, at: Target | null, layout: FrameLayout): Promise<Extract<FromFrame, { type: 'opened' }>>;
    setLayout(layout: FrameLayout): void;
    next(): void; prev(): void; goTo(target: Target): void;
    setMarks(marks: Mark[]): void;
    search(query: string, onResult: (r: Extract<FromFrame, { type: 'search-result' }>) => void, onProgress: (fraction: number) => void): Promise<void>;
    stopSearch(): void; clearSelection(): void;
    on<T extends FromFrame['type']>(type: T, fn: (msg: Extract<FromFrame, { type: T }>) => void): () => void;
    close(): Promise<void>;
  }
  ```

  Una nuova `search` ferma quella in corso. La sua promessa si risolve a `search-done`, o subito se è stata superata.
- **Tocchi e tasti:** il motore manda `tap` e `key` alla vista. `tap.zone` è `start` nel terzo iniziale, `center` nel mezzo, `end` nel terzo finale (nelle lingue da destra a sinistra si scambiano). Il motore non gira pagina da solo sui tocchi: decide la vista.
- **Velocità:** il motore toglie l'attesa di 100 ms di foliate-js fra due giri solo se serve a stare nel budget dei test; altrimenti la lascia.

## Valori fissati

- **Temi** (`src/model/themeColors.ts`):

  | Tema | page | ink | muted | faint | rule | raised | inset |
  |---|---|---|---|---|---|---|---|
  | `light` | `#fbfaf8` | `#27241f` | `#5b554d` | `#6f675d` | `#ebe7e0` | `#ffffff` | `#f5f3ef` |
  | `sepia` | `#f2e8d9` | `#3a3224` | `#625646` | `#6b5f4d` | `#e2d3ba` | `#f8f1e6` | `#ebdfcb` |
  | `dark` | `#161512` | `#d8d6d2` | `#a9a59e` | `#8f8b83` | `#2c2a25` | `#211f1b` | `#1f1d1a` |
  | `black` | `#000000` | `#b8b4ac` | `#8f8b83` | `#86827a` | `#1f1d1a` | `#0e0d0b` | `#161512` |

  - **Accento** in `light` e `sepia`: testo `#3b6953`, fondo tenue `#f1f7f4` (seppia `#e9eadb`), fondo forte `#dcebe2` (seppia `#d6e0cc`), testo sull'accento `#284439`, controllo `#4d8369`, pieno `#3b6953`.
  - **Accento** in `dark` e `black`: testo `#92baa6`, fondo tenue `#1b2b24` (nero `#14211b`), fondo forte `#25392f` (nero `#1f3128`), testo sull'accento `#dcebe2`, controllo `#6a9c83`, pieno `#3b6953`.
  - `auto` è `dark` quando l'app è scura, altrimenti `light`.
  - Un test prova 4,5:1 per ink, muted, faint e il testo d'accento su page, raised e inset, e per il testo sull'accento sui due fondi d'accento, in ogni tema.
- **Evidenziazioni** (`src/model/highlightColors.ts`): `amber` `#c9954a`, `sage` `#7c8f6a`, `terracotta` `#b8704f`, `night` `#3a4a6b`.
  - **La velatura** è `mix(colore, page, p)`. `p` vale 50%, 45%, 42% e 30% in `light` e `sepia`, nell'ordine dei colori; 42%, 48%, 44% e 46% in `dark` e `black`.
  - Nei temi scuri `night` parte da `#858fa3`.
  - Un test prova 4,5:1 per ink su ogni velatura, in ogni tema.
  - Il pallino nelle liste usa il colore pieno; nei temi scuri `night` usa `#858fa3`.
  - Nomi: «Ambra», «Salvia», «Terracotta», «Notte».
- **Regolazioni** (`ReaderSettings`), salvate in `localStorage` alla chiave `bookeeper.reader.settings`:

  ```ts
  type ThemeChoice = 'auto' | 'light' | 'sepia' | 'dark' | 'black';
  type FontChoice = 'publisher' | 'lora' | 'inter' | 'serif' | 'sans';
  interface ReaderSettings {
    theme: ThemeChoice; font: FontChoice; fontSize: number; lineHeight: 1.4 | 1.6 | 1.8;
    margins: 'narrow' | 'medium' | 'wide'; flow: 'paginated' | 'scrolled'; twoPages: boolean;
    justify: boolean; hyphenate: boolean; publisherStyles: boolean; pdfFit: 'width' | 'page'; panelOpen: boolean;
  }
  const DEFAULT_SETTINGS = { theme: 'auto', font: 'publisher', fontSize: 18, lineHeight: 1.6, margins: 'medium',
    flow: 'paginated', twoPages: true, justify: true, hyphenate: true, publisherStyles: true, pdfFit: 'width', panelOpen: false };
  ```

  - `fontSize` va da 12 a 32, intero. Un valore sbagliato o mancante torna al predefinito, campo per campo.
  - **I caratteri:** `publisher` lascia quello del libro, e se il libro non ne ha usa Lora. `lora` e `inter` usano i file di `@bookeeper/ui/fonts.css`, serviti da `'self'`. `serif` è `ui-serif, Georgia, serif`; `sans` è `system-ui, sans-serif`.
  - **Margini** (`gap` di foliate-js): `narrow` 4%, `medium` 7%, `wide` 10%. La colonna è larga al massimo 720 px. Due colonne solo se `twoPages` e se la pagina è larga almeno 1000 px.
- **Altre chiavi locali:**
  - `bookeeper.reader.position.<fileId>`, con `{ value, percent, at }`: l'ultima posizione su quel dispositivo;
  - `bookeeper.reader.speed`, con `{ charsPerMinute, measuredMs }`.
- **Tempi:**
  - la posizione si salva 2000 ms dopo l'ultimo giro, e subito alla chiusura, a `pagehide` e quando la pagina diventa nascosta;
  - «Apro il libro…» compare dopo 300 ms;
  - «Torna al …» sparisce dopo due giri in avanti;
  - le uscite dei controlli durano `--bk-dur-fast`, le entrate `--bk-dur`;
  - la pagina scorre in `--bk-dur` con `--bk-ease`; con `prefers-reduced-motion` cambia di colpo.
- **Velocità di lettura:** contano solo le pagine rimaste fra 2 secondi e 3 minuti. Media mobile con peso 0,2 sui caratteri al minuto. I tempi compaiono dopo 3 minuti misurati su quel dispositivo.
- **Misure:**
  - barra in alto 52 px, barra in basso 56 px;
  - pannello 360 px. Spinge la pagina se la finestra è larga almeno 1100 px, altrimenti la copre;
  - controlli del mouse: fascia di 64 px in alto e 72 px in basso;
  - telefono: bersagli di almeno 44×48 px; il foglio si apre al 70% dell'altezza.
- **«Continua da …»:** una fonte conta se è di un altro dispositivo, è più avanti di almeno 1 punto percentuale ed è più recente della posizione locale. Fra più fonti vince la più avanti; a pari merito la più recente.
- **«Cerca sul web»:** `https://duckduckgo.com/?q=` più il testo codificato, al massimo 300 caratteri.
- **Esportazione Markdown:** il nome del file è «Autore - Titolo - note.md», senza i caratteri vietati nei nomi di file. Il contenuto:

  ```markdown
  # I promessi sposi

  Alessandro Manzoni

  ## Capitolo I

  > Quel ramo del lago di Como, che volge a mezzogiorno, tra due catene non interrotte di monti

  L'incipit che si studia a scuola: rileggerlo ad alta voce.

  *1% · Ambra*

  ## Segnalibri

  - Capitolo I · 3% — «Per un buon pezzo, la costa sale con un pendìo lento e continuo…»
  ```

  - I capitoli seguono l'ordine del libro. Una nota con più paragrafi resta com'è.
  - In inglese le etichette sono tradotte («Bookmarks», «Amber»…).

## API (la task `annotations-api` la realizza; le altre la usano)

- **Migrazione `0006_annotations.sql`**, tabella `annotations`:
  - `id` TEXT PK (UUID del dispositivo);
  - `library_id`, `user_id` e `book_id`, FK con CASCADE;
  - `file_sha256` TEXT NOT NULL;
  - `kind` TEXT CHECK IN ('highlight','bookmark');
  - `cfi` TEXT NOT NULL;
  - `text` TEXT NOT NULL DEFAULT '';
  - `color` TEXT NULL CHECK IN ('amber','sage','terracotta','night');
  - `note` TEXT NULL;
  - `percent` REAL NOT NULL CHECK 0..100;
  - `chapter` TEXT NULL;
  - `created_at`, `updated_at` INTEGER NOT NULL, `deleted_at` INTEGER NULL;
  - indice su (`user_id`, `book_id`, `updated_at`).

  Le ore sono nello stesso formato delle altre tabelle.
- **`GET /api/v1/books/{id}/annotations`**, con `?since=<ora>` facoltativo:
  - senza `since`: le annotazioni non cancellate della persona per quel libro, in ordine di `percent`;
  - con `since`: tutte quelle con `updated_at > since`, cancellate comprese.
  - Risponde `AnnotationOut[]`.
- **`PUT /api/v1/books/{id}/annotations/{annotation_id}`**, con `PutAnnotation { file_sha256, kind, cfi, text, color, note, percent, chapter, created_at, updated_at, deleted }`:
  - crea o aggiorna. Se la riga salvata ha `updated_at` maggiore o uguale, non cambia nulla e risponde la riga salvata;
  - `deleted: true` scrive `deleted_at = updated_at`;
  - risponde 200 con `AnnotationOut`.
- **`AnnotationOut`:** `{ id, file_sha256, kind, cfi, text, color, note, percent, chapter, created_at, updated_at, deleted_at }`.
- **Controlli:**
  - `who.require(Role::Member)`, quindi `guest` riceve 403;
  - un id che appartiene a un'altra persona risponde 404;
  - `file_sha256` deve essere un file attaccato a quel libro, altrimenti 404;
  - `highlight` vuole un colore, `bookmark` non lo vuole: 422;
  - limiti: `cfi` 4000 caratteri, `text` 5000, `note` 10000, `chapter` 300; `percent` fra 0 e 100; `updated_at` non più di 5 minuti nel futuro: 422;
  - le note non vanno nel registro attività.
- **Backup:** `annotations` entra in `TABLES` di `backup.rs` e si cancella al ripristino come `reading_positions`.
- **`PositionOut`** riceve `device_kind` (`desktop`, `mobile`, o `null` se il dispositivo non c'è più).
- **`packages/api`:**
  - `resources/positions.ts` con `positionsApi(t)`: `listPositions(bookId)` e `putPosition(bookId, fileId, body)`;
  - `resources/annotations.ts` con `annotationsApi(t)`: `listAnnotations(bookId, since?)` e `putAnnotation(bookId, id, body)`;
  - entrambe in `createClient`, con i tipi esportati da `index.ts`.
- **Dopo ogni modifica dell'API:**

  ```
  UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi -- --include-ignored && npm run gen -w @bookeeper/api && npm test -w @bookeeper/api
  ```

## Il lettore nelle app

- **Rotte:** `/read/:bookId`, con `?file=<file_id>` facoltativo, fuori dalla cornice dell'app sul computer e fuori dalla barra delle schede sul telefono.
  - `AppModule` (computer) e `MobileModule` (telefono) ricevono il campo `screens: RouteObject[]`: rotte con la sessione ma senza cornice.
  - Senza `?file`, il lettore sceglie EPUB, poi MOBI, AZW3, FB2, CBZ e per ultimo PDF; a parità, il più vecchio.
- **Il backend** che ogni app passa a `ReaderApp` (`@bookeeper/reader/data`):

  ```ts
  interface ReaderBackend {
    deviceId: string;
    loadFile(signal: AbortSignal, onProgress: (fraction: number) => void): Promise<Blob>;
    listPositions(): Promise<PositionOut[]>;
    putPosition(body: PutPosition): Promise<void>;
    getReading(): Promise<ReadingOut | null>;
    markRead(): Promise<void>;
    listAnnotations(since?: number): Promise<AnnotationOut[]>;
    putAnnotation(id: string, body: PutAnnotation): Promise<AnnotationOut>;
    openExternal(url: string): void;
    saveText(fileName: string, text: string): Promise<void>;
    queue: OfflineQueue;
  }
  ```

  Il backend è già legato a un libro e a un file. `OfflineQueue` (`memoryQueue()`, `idbQueue(name)`) è definita da `reader-sync`.
- **Computer, file:** il comando Tauri `reader_file { connection_id, book_id, file_id, sha256, format }` copia il file a flusso in `<app_cache_dir>/reader/<sha256>.<ext>`, se non c'è già, e risponde il percorso.
  - Tiene i 10 file usati più di recente.
  - La vista lo legge con `convertFileSrc` e il protocollo `asset`. Lo scope è solo `$APPCACHE/reader/**`.
- **Telefono, offline:**
  - i file in OPFS, `books/<sha256>.<ext>`;
  - IndexedDB `bookeeper-reader`, versione 1, con gli store `offline` (chiave `sha256`) e `queue` (chiave automatica).
  - Il service worker mette nella cache iniziale anche `reader-frame.html`, `reader/**` e i file `mjs`, `bcmap`, `pfb` e `ttf`, con `maximumFileSizeToCacheInBytes` a 4 MB.
- **iPhone non installato:** `/iPad|iPhone|iPod/` nello user agent, oppure `MacIntel` con `maxTouchPoints > 1`, e non `standalone` (la prova di `modules/account/install.ts`).

## Regole

- **Interfaccia:** Impeccable in modalità **Operate** (`.claude/skills/impeccable/`):
  - setup con `impeccable context --target <file>`;
  - il brief è `apps/desktop/.impeccable/surfaces/src-modules-reader-readerview-tsx.md`, gli stati sono quelli della cartella degli schizzi;
  - `reference/craft-floor.md` prima di ogni modifica;
  - `impeccable detect --json` pulito alla fine.

  Telemetria spenta (`DO_NOT_TRACK=1 IMPECCABLE_NO_TELEMETRY=1`). Il salvataggio remoto dei rapporti NON si usa. Non proporre alternative di design: segui gli schizzi e `DESIGN.md`, e scrivi nel rapporto cosa hai deciso.
- **Componenti:** dal kit (`@bookeeper/ui`) quando c'è: `IconButton`, `Button`, `PillTabs`, `Tooltip`, `Menu`, `Dialog`, `Drawer`. Il foglio dal basso del telefono è `BottomSheet` di `apps/mobile/src/kit`; nel pacchetto ne serve uno uguale, che sta in `src/ui/view/Sheet.tsx`.
- **Regole di sempre:**
  - nessun componente oltre 250 righe;
  - nessun testo nei componenti: tutto in `packages/i18n`, italiano e inglese;
  - nessuna chiamata al client dentro un componente;
  - nessun colore letterale fuori dai due file di dati;
  - ogni animazione dentro `@media (prefers-reduced-motion: no-preference)`;
  - WCAG 2.2 AA;
  - ogni comportamento ha un test.
- **Ambito:** ogni task tocca solo i file dichiarati.
- **Rischi:** nessuna modifica a `ops/`, ai workflow `vps-*.yml`, a `release.yml` o al servizio degli aggiornamenti.
- **Verifica:** `.forge/verify` (fmt, clippy, test Rust, `npm ci`, typecheck, test JS).

## Cose che più facilmente farebbero male, e dove sono provate

1. **Un libro che esegue codice o chiama la rete.** Lo prova `reader-e2e`, in tre motori e passando dalla pagina vera del motore.
2. **La pagina che si sposta dopo un cambio di carattere, tema, finestra o pannello.** Lo provano `reader-e2e` (la posizione resta entro lo 0,5% dopo il cambio) e `reader-app` (dopo un cambio non parte nessun `goto`).
3. **Una nota presa senza rete che si perde.** Lo prova `reader-sync`: la coda resta dopo un riavvio, si svuota al ritorno della rete, e vince l'ultima modifica.
4. **La ricerca che blocca la pagina su un libro grande.** Lo prova `reader-e2e`: mentre cerca nel libro di 200 capitoli, girare pagina resta sotto i 100 ms al 95° percentile.
5. **Il lettore che non si apre.** Lo provano:
   - `local-auth`: una libreria locale riceve la sessione;
   - `server-frame`: la pagina del motore si apre in una cornice dello stesso sito.
