Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# App: fornitori, sessione, router, guscio, tema

## Obiettivo

Trasformare `apps/desktop` da pagina di prova a struttura dell'app: piattaforma, sessione, router a moduli, guscio con sidebar e barra del titolo integrata, tema. Le task `ui-base`, `i18n-ns` e `desktop-session` sono già unite. I moduli (`welcome`, `books`) arrivano con altre task: qui NON crearli.

Leggi `apps/desktop/src/`, `packages/api/src/` (in particolare `transport.ts`, `client.ts` e come i test trattano i token) e `apps/desktop/src-tauri/src/lib.rs`.

## Cosa fare

1. **Dipendenze** del contratto in `apps/desktop/package.json`; `npm install` dalla radice. `vite.config.ts`: CSS Modules nei test, `envPrefix` che include `VITE_`. `tsconfig.json`: tipi `vite/client`.
2. **`src/platform/`**: interfaccia `Platform` del contratto, `tauriPlatform()`, `browserPlatform()`, e `PlatformProvider`/`usePlatform`. Il trasporto Tauri esistente (`src/transport.ts`) si sposta qui e accetta `connectionId`. Tipi `Connection`, `Connections`, `ProbeOut`, `Found` uguali ai nomi dei campi Rust del contratto. Il comando `server_probe` e `discover` arrivano con la task `desktop-remote`, che può non essere ancora unita: chiamali per nome; un comando assente è un errore gestito (`probe` restituisce `{ reachable: false, error: 'network' }`, `discover` restituisce `[]`).
3. **`src/session/`**: store `useSession` del contratto, trasporto autenticato (aggiunge `Authorization`, un solo rinnovo su 401, richieste concorrenti condividono lo stesso rinnovo), `ClientProvider`/`useClient` che espone `createClient(trasporto autenticato)`, azioni `signIn(connection, auth: AuthOut)`, `signOut()` (chiama `POST /auth/logout`, poi toglie i token dalla connessione e torna a `welcome`), `forget(id)`.
4. **`src/app/`**: `AppModule`, raccolta dei moduli con `import.meta.glob`, router, `QueryClientProvider` (nessun rinnovo automatico al fuoco della finestra; un errore 401 non si ritenta), fornitore della lingua (`useT()` restituisce `(key, vars?) => string`), limite d'errore di rotta con `EmptyState` e bottone "Riprova".
5. **`src/shell/`**: guscio del mockup. `Sidebar` (voci dai moduli, gruppi `main` e `bottom`, voce attiva a pillola con `aria-current="page"`), `TitleBar` (fascia con `data-tauri-drag-region`; controlli finestra con nome accessibile, assenti se `platform.window` è `null`; il bottone ingrandisci mostra "ripristina" quando la finestra è ingrandita), `LibraryBadge` (nome libreria, "nome · ruolo", menu con "Tema" e "Esci"), area contenuto con transizione di rotta.
6. **Tema**: `useTheme` (`light`/`dark`/`system`), classe `dark` su `<html>`, ascolto di `prefers-color-scheme` in modalità `system`. Uno script in linea in `index.html` applica il tema salvato prima del primo disegno. Caratteri: Inter e Lora NON si scaricano da Internet; se nel repository non ci sono file di carattere, resta la pila di ripiego dei token e lo dichiari nel rapporto.
7. **Ricerca globale**: `useSearchShortcut(ref)` che una vista usa per ricevere il fuoco con `Ctrl K`/`Cmd K`.
8. **`main.tsx`** monta i fornitori. `App.tsx` e `App.test.tsx` di oggi spariscono o cambiano: la pagina di stato non serve più.
9. **i18n**: spazio dei nomi `shell` in italiano e inglese (voci di sistema, controlli finestra, tema, esci, errori generici).

## Test

Accanto ai file. Un `Platform` finto in `src/platform/testing.ts` (in memoria), usabile anche dalle task dei moduli, e `renderApp({ platform, modules, route })` in `src/app/testing.tsx`.

- Sessione: senza connessioni → `welcome`; connessione con token valido → `ready` con `me`; 401 su `/me` e rinnovo riuscito → `ready` e token nuovi salvati con `upsert`; rinnovo fallito → `welcome`, connessione ancora presente; due richieste con 401 insieme → un solo rinnovo; `signOut` chiama il logout e toglie i token.
- Router: con stato `welcome` una rotta protetta porta a `/welcome`; con stato `ready` `/welcome` porta alla prima voce di navigazione; un modulo finto con `nav` compare nella sidebar e la sua rotta si monta; senza moduli si vede l'`EmptyState`.
- Guscio: la voce attiva ha `aria-current="page"`; i controlli finestra chiamano la piattaforma; con `window: null` non ci sono; il menu della libreria mostra nome e ruolo e "Esci" chiama `signOut`.
- Tema: `system` segue `matchMedia`; la scelta è salvata e riapplicata; la classe `dark` compare e scompare.
- Piattaforma browser: `connections` sopravvive a una nuova istanza (stesso `localStorage`); `discover` dà `[]`.
- Trasporto Tauri: i test esistenti di `transport.test.ts` restano verdi dopo lo spostamento; `connectionId` arriva al comando come `connection_id`.
- `useSearchShortcut`: `Ctrl K` e `Cmd K` danno il fuoco; in un campo di testo che non è quello di ricerca funziona comunque; il comportamento predefinito del browser è impedito.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm run build -w @bookeeper/desktop` passa.
- `npm run typecheck` e `npm test` dalla radice passano.
- Avvio nel browser: `VITE_API_URL=http://127.0.0.1:7842 npm run dev -w @bookeeper/desktop` serve una pagina che, senza moduli, mostra la pagina minima di `/welcome` senza errori in console (prova con una richiesta alla pagina; non serve un browser).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti.
- Cambiano solo: `apps/desktop/package.json`, `package-lock.json`, `apps/desktop/vite.config.ts`, `apps/desktop/tsconfig.json`, `apps/desktop/index.html`, file sotto `apps/desktop/src/` (esclusa `apps/desktop/src/modules/`), `packages/i18n/src/locales/it/shell.json`, `packages/i18n/src/locales/en/shell.json`.
