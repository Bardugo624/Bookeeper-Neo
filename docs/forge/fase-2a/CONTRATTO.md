# Contratto del run 2A

Valgono le regole dei contratti della fase 1 (`docs/forge/fase-1a` … `fase-1e`) per tutto ciò che riguarda core, server e API. Qui ci sono le regole del lato client. Dove i file divergono, vince questo. L'aspetto è fissato da `docs/forge/fase-2a/MOCKUP.md`.

## Regole

- Tocca solo i file dichiarati per la tua task. Se ne serve un altro, fermati e dillo.
- **Dipendenze npm**: le aggiungono solo `ui-base` (per `packages/ui`) e `app-foundation` (per `apps/desktop`). Le altre task, se manca una dipendenza, si fermano e lo dicono. `package-lock.json` si aggiorna con `npm install`, mai a mano.
- **Dipendenze Rust**: le aggiungono solo `desktop-session` e `desktop-remote`, e solo in `apps/desktop/src-tauri/Cargo.toml`. Un solo fornitore crittografico, `ring`: `cargo tree -i aws-lc-rs`, `cargo tree -i aws-lc-sys` e `cargo tree -i openssl-sys` NON DEVONO trovare nulla.
- Nessun accesso a Internet nei test. Connessioni a `127.0.0.1` su porta `0` sono permesse. Un test che ha bisogno del multicast è `#[ignore]`.
- Nessun test che afferma uno stato provvisorio.
- **Nessuna interfaccia morta**: un bottone, una voce o una rotta esiste solo se fa qualcosa in questo run.
- Formattazione Rust: solo i tuoi file, `rustfmt --edition 2021 <file>`. Non eseguire `cargo fmt --all`.
- Gli alberi 0.3 (`server/`, `clients/`, `deploy/`) e `.github/workflows/deploy-server.yml` si leggono, non si modificano. `clients/desktop/frontend` è il riferimento di comportamento della 0.3: leggilo, non copiarne il codice Vue.
- Testi dell'interfaccia: mai scritti nei componenti. Passano da `@bookeeper/i18n`, in italiano e in inglese. Commenti nel codice: in inglese.
- Nessun codice copiato da librerie di componenti di terze parti. Le quattro idee di movimento si scrivono da zero.

## Regole del codice React

- TypeScript `strict`. Componenti funzione. Nessun `any`.
- Un componente non supera 250 righe. La logica sta in hook. Un componente non chiama mai la rete: usa hook che usano il client.
- Stile: **CSS Modules** (`Nome.module.css`) con i token `--bk-*`. Nessun valore di colore scritto nei componenti, salvo le tinte delle copertine e i colori degli scaffali. Niente Tailwind, niente CSS-in-JS, niente stili in linea salvo valori calcolati (larghezze, trasformazioni, variabili CSS).
- Tema: i token cambiano con la classe `dark` su `<html>`. Nessuna regola scura dentro i componenti.
- Movimento: solo `transform` e `opacity`, durate e curve dai token. Ogni animazione è dentro `@media (prefers-reduced-motion: no-preference)`. Nessuna libreria di animazione.
- Vietati: bordi laterali colorati come indicatore, testo sfumato, vetro decorativo, animazioni su proprietà di layout.
- Accessibilità: ogni controllo è raggiungibile da tastiera, ha nome accessibile e anello di fuoco visibile (`:focus-visible`, 2px `--bk-primary-400`). Contrasto del testo almeno 4,5:1.
- Test: Vitest con Testing Library, ambiente `jsdom`. Si interroga per ruolo e nome accessibile, non per classe.

## `packages/ui`

Tre punti d'ingresso, uno per task. `ui-base` scrive in `package.json`:

```json
"exports": {
  ".": "./src/index.ts",
  "./tokens.css": "./src/tokens.css",
  "./base.css": "./src/base/base.css",
  "./base": "./src/base/index.ts",
  "./overlays": "./src/overlays/index.ts",
  "./book": "./src/book/index.ts"
}
```

`src/index.ts` resta com'è: esporta solo `TOKEN_PREFIX`. Dipendenze, tutte installate da `ui-base`: `radix-ui` (primitive accessibili senza stile), `lucide-react` (icone), `react` e `react-dom` come `peerDependencies`; per i test `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`.

### Token aggiunti (`ui-base`, in `tokens.css`, chiaro e scuro)

`--bk-ok`, `--bk-warn` (`#b7791f` in chiaro), `--bk-danger` (`#b4493b` in chiaro), ciascuno con `-bg` (velatura) e con una variante scura leggibile su `--bk-surface`; `--bk-on-primary: #ffffff`; `--bk-focus: var(--bk-primary-400)`; `--bk-tooltip-bg` e `--bk-tooltip-text`; `--bk-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`.

### `@bookeeper/ui/base` (`ui-base`)

```ts
Icon            // { name: IconName; size?: number } — un solo punto che mappa nomi propri su Lucide, tratto 1,75
Button          // variant: 'primary' | 'secondary' | 'ghost' | 'danger'; size: 'md' | 'sm'; icon?; loading?
IconButton      // richiede `label` (nome accessibile)
Field           // etichetta, messaggio d'errore, descrizione; collega `htmlFor`, `aria-describedby`, `aria-invalid`
Input, Textarea
Tag             // tone: 'neutral' | 'primary' | 'ok' | 'warn' | 'danger'
Kbd
Skeleton        // rettangolo o riga; `aria-hidden`
Spinner         // richiede `label`
EmptyState      // icona, titolo, testo, azione facoltativa
Divider
```

`base.css`: reset minimo, `font-family` dai token, anello di fuoco, selezione del testo, `color-scheme`.

### `@bookeeper/ui/overlays` (`ui-overlays`)

```ts
Dialog, Drawer            // su Radix Dialog: titolo obbligatorio, chiusura con Esc, fuoco intrappolato
Menu                      // su Radix DropdownMenu
Select                    // su Radix Select
PillTabs                  // { items: {id,label,icon?,dot?}[]; value; onChange; size?: 'md'|'sm'; variant?: 'pill'|'segmented' }
                          // ruoli tablist/tab, frecce da tastiera, indicatore unico che scorre con `transform`
ToastProvider, useToast   // { title, description?, tone? }; regione `aria-live`
Tooltip                   // { content; side? }; comparsa con `--bk-ease-spring`, ritardo 300 ms, anche al fuoco
```

### `@bookeeper/ui/book` (`ui-book`)

```ts
clothTone(seed: string): string            // tinta deterministica, sempre la stessa per lo stesso titolo
BookCover     // { title; author?; src?; color?; width?; lift?: boolean } — segnaposto o immagine, come in MOCKUP.md
Book3D        // { title; author?; src?; color?; width?; pages?: number } — dorso, taglio, inclinazione; spessore dal numero di pagine
ProgressRing  // { value: 0..1; size?; label } — role="progressbar", aria-valuenow
FillBar       // { value: 0..1; tone?: 'ok'|'warn'|'danger'|'auto'; label } — indicatore con `scaleX`
StatCard      // { label; value; glyph?; tone? } — valore in Lora, conteggio animato 600 ms
```

## `@bookeeper/i18n` (`i18n-ns`)

Cataloghi in `packages/i18n/src/locales/<lingua>/<spazio>.json`, caricati con `import.meta.glob(..., { eager: true })`. La chiave è `<spazio>.<percorso>`: `t(locale, 'books.empty.title')` legge `locales/it/books.json`. Le chiavi esistenti (`app.name`, `status.*`, `mobile.needsHttps`) continuano a funzionare senza toccare chi le usa. Un test fallisce se una chiave esiste in una lingua e non nell'altra. Ogni task aggiunge solo i file del proprio spazio dei nomi, in entrambe le lingue.

## Guscio Tauri

### Connessioni (`desktop-session`, in `connections.rs`)

File `connections.json` nella cartella dati dell'app, scritto in modo atomico, permessi `0600` su Unix.

```rust
pub enum ConnectionKind { Local, Remote }          // JSON: "local" | "remote"
pub struct Connection {
    pub id: String,                  // UUID v7
    pub kind: ConnectionKind,
    pub url: Option<String>,         // solo remote, senza barra finale
    pub fingerprint: Option<String>, // solo remote con certificato autogenerato: 64 cifre esadecimali
    pub library_name: Option<String>,
    pub user_name: Option<String>,
    pub device_id: Option<String>,
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
}
pub struct Connections { pub active: Option<String>, pub items: Vec<Connection> }
```

Comandi Tauri (nomi e argomenti in `snake_case`):

| Comando | Effetto |
| --- | --- |
| `connections_get()` | `Connections` |
| `connection_upsert(connection)` | salva; restituisce `Connections` |
| `connection_activate(id)` | imposta `active`; errore se l'id non esiste |
| `connection_remove(id)` | rimuove; se era attiva, `active` diventa `null` |

Esiste al più una connessione `local`. I token non compaiono mai nei log.

### Finestra (`desktop-session`)

`decorations: false` in `tauri.conf.json`. Il permesso della finestra concede solo: riduci, ingrandisci/ripristina, chiudi, trascina, stato di ingrandimento. La webview usa `@tauri-apps/api/window`.

### Trasporto remoto (`desktop-remote`)

`api_request` e `api_request_raw` ricevono un argomento facoltativo `connection_id`. Senza, usano la connessione attiva; senza connessione attiva, o con una connessione `local`, inoltrano al core in processo come oggi. Con una connessione `remote` inoltrano a `url` con `reqwest` (rustls, `ring`).

- `https://` con certificato valido: radici WebPKI.
- `fingerprint` presente: si accetta solo quel certificato (`bookeeper_net::tls::pinned_client_config`).
- `http://` è accettato solo verso indirizzi locali: loopback, reti private (10/8, 172.16/12, 192.168/16, 169.254/16, fc00::/7, fe80::/10) e nomi `.local`. Altrimenti risposta 400 `insecure_address`.
- Server irraggiungibile: stato `0` con `error_code` `network`, come oggi.

```rust
// comando `server_probe(url)` -> ProbeOut
pub struct ProbeOut {
    pub reachable: bool,
    pub trusted: bool,                 // certificato valido per le radici WebPKI, o http locale
    pub fingerprint: Option<String>,   // presente se il certificato non è fidato
    pub phrase: Option<String>,        // frase di verifica di quell'impronta (sei parole)
    pub server: Option<ServerOut>,     // GET /api/v1/server
    pub setup: Option<SetupStatus>,    // GET /api/v1/setup
    pub error: Option<String>,         // "insecure_address" | "network" | "not_bookeeper"
}
// comando `discover()` -> Vec<Found>   (bookeeper_net::mdns::browse, 2 secondi)
```

## App React (`app-foundation`)

Dipendenze: `react-router` 7, `@tanstack/react-query` 5, `zustand` 5, `@testing-library/user-event`.

### Piattaforma

Tutto ciò che non è HTTP passa da un'interfaccia, con due implementazioni:

```ts
export interface Platform {
  kind: 'tauri' | 'browser';
  transport(connectionId?: string): Transport;       // @bookeeper/api
  connections: { get(); upsert(c); activate(id); remove(id) };
  probe(url: string): Promise<ProbeOut>;
  discover(): Promise<Found[]>;
  window: { minimize(); toggleMaximize(); close(); startDragging(); } | null;   // null nel browser
  deviceName(): Promise<string>;
}
```

- `tauriPlatform()`: comandi del guscio.
- `browserPlatform(baseUrl)`: solo sviluppo e test a vista. Attiva quando `window.__TAURI_INTERNALS__` manca. Usa `createFetchTransport(import.meta.env.VITE_API_URL)`, tiene le connessioni in `localStorage`, `probe` interroga `/api/v1/server` e `/api/v1/setup` con `fetch`, `discover` restituisce `[]`.

### Sessione

`useSession` (zustand): `{ status: 'loading' | 'welcome' | 'ready', connection, me }`. All'avvio legge le connessioni; con una connessione attiva e un token chiama `GET /me`; su 401 rinnova con il `refresh_token`; se il rinnovo fallisce, lo stato è `welcome` con la connessione ancora elencata (percorso "Bentornato"). Ogni richiesta porta `Authorization: Bearer`. Un 401 a sessione avviata tenta un solo rinnovo, poi riporta a `welcome`. I token nuovi sono salvati con `connections.upsert`.

### Router e moduli

`createHashRouter`. Ogni modulo vive in `apps/desktop/src/modules/<nome>/` ed esporta da `routes.tsx`:

```ts
export const module: AppModule = {
  id: 'books',
  routes: RouteObject[],                    // montate dentro il guscio
  nav?: { labelKey: string; icon: IconName; to: string; group: 'main' | 'bottom'; order: number },
  public?: RouteObject[],                   // montate fuori dal guscio (primo avvio)
};
```

`app-foundation` raccoglie i moduli con `import.meta.glob('./modules/*/routes.tsx', { eager: true })`. La sidebar mostra solo le voci dei moduli presenti. Senza moduli il guscio mostra un `EmptyState`. Stato `welcome`: si monta la rotta pubblica `/welcome`; se nessun modulo la fornisce, una pagina minima col marchio.

### Guscio e tema

Guscio come in `MOCKUP.md`: sidebar, fascia trascinabile, controlli finestra (assenti nel browser), riga della libreria con menu "Esci". Cambio di rotta: fade e rise 8px. Tema `'light' | 'dark' | 'system'` salvato in `localStorage`, applicato prima del primo disegno. `Ctrl K` (e `Cmd K`) porta il fuoco al campo di ricerca della vista, se la vista ne registra uno.
