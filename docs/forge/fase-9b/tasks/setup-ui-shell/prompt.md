Leggi prima `docs/forge/fase-9b/CONTRATTO.md`, il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Interfaccia», «Citazioni», «Accessibilità»), il brief `apps/setup/.impeccable/surfaces/src-main-tsx.md` e le bozze `docs/superpowers/specs/2026-11-27-setup-windows/01-benvenuto.html`, `02-personalizza.html`, `11-tema-scuro.html`. La task `setup-ui-base` è già unita: usa le sue chiavi `setup.*`, le icone nuove, `FillBar` con `valueText` e `apps/setup/src/quotes.json`.

# Il Setup: app, ponte, guscio e frontespizio

## File
- Crea `apps/setup/` (non `src-tauri/`):
  - `package.json`, `index.html`, `vite.config.ts`, `tsconfig.json`;
  - `src/main.tsx`, `src/test-setup.ts`;
  - `src/app/`, `src/bridge/`, `src/shell/`;
  - i segnaposto `src/install/index.tsx` e `src/uninstall/index.tsx`, con le firme del contratto.
- Modifica `package-lock.json` (`npm install` per il nuovo workspace).

## Interfacce prodotte
- **Ponte** (`src/bridge/`):
  - i tipi del contratto;
  - `tauriBridge`, con `invoke` e `listen`;
  - `mockBridge(scenario)`, per il browser e i test. Lo scenario si sceglie con `#scenario=<nome>` nell'indirizzo: `welcome`, `customize`, `progress`, `done`, `running`, `error`, `older`, `same`, `newer`, `legacy`, `uninstall`, `uninstall-ebooks`, `uninstall-remote`, `removed`, `elevated`, `incomplete`, `unsupported`, `dark`;
  - gli hook `useSetupInfo`, `useDirCheck`, `useInstall`, `useUninstall`, `useProgress`, `useLogTail`, `useLaunchApp`, `useQuit`, `useWindowControls`.
- **Guscio** (`src/shell/`): `SetupLayout`, `useQuotes`, `formatBytes`, con le firme del contratto. In più:
  - `ProgressBlock({ titleKey, event })`: titolo, percentuale, `FillBar tone="ok"` con `valueText` e una regione viva educata che annuncia il passo nuovo;
  - `BlockedPanel({ kind })`;
  - `TitleBar({ busy })`.
- **App** (`src/app/`): legge `setup_info` e sceglie fra `BlockedPanel`, `InstallFlow` e `UninstallFlow`. Su `setup://uninstall-requested`, se nessuna operazione è in corso, passa a `UninstallFlow`. Dopo il primo disegno chiama `ready`.

## Cosa decidere, e come
- **Lingua:** `resolveLocale('system', navigator.language)` di `@bookeeper/i18n`. **Tema:** `html.dark` da `prefers-color-scheme`, che segue anche i cambi.
- **`vite.config.ts`:** come quello dell'app, porta 5175.
- **`package.json`:** script `dev`, `build`, `test`, `typecheck`, `tauri`; `@tauri-apps/cli` esattamente `2.12.6`.
- **Barra del titolo:**
  - icona dell'app 18px, «Bookeeper» in Lora 15px, trascinabile (`data-tauri-drag-region`);
  - `IconButton` per riduci e chiudi;
  - con `busy`, chiudi è disattivato e ha il suggerimento `setup.window.busy`.
- **`SetupLayout`:** le misure di `01-benvenuto.html` e `02-personalizza.html`.
  - Frontespizio su `--bk-chrome`, margine sinistro 72px; pannello su `--bk-surface` con filetto in alto.
  - Il pannello è sempre alto quanto la versione `tall`. Da `short` sta più in basso, tradotto con `translateY`, e sale in `--bk-dur-slow` `--bk-ease`.
  - La citazione passa da piena a compatta con FLIP (`scale` e `translate`). Con `prefers-reduced-motion` tutto è immediato.
- **`Frontispiece`:**
  - `<figure>` con `<blockquote>` e `<figcaption>`, l'opera in `<cite>` corsivo;
  - caporali «» in `--bk-accent-text`, il primo appeso con `text-indent` negativo;
  - le virgolette basse interne diventano “ ”;
  - dimensioni secondo il design, contando i caratteri nella lingua mostrata;
  - la citazione nuova entra con `bk-rise`; nessuna regione viva.
- **Citazioni** (da `apps/setup/src/quotes.json`):
  - `useQuotes().pick('welcome')` sceglie solo fra le citazioni fino a 140 caratteri nella lingua mostrata;
  - `pick('progress')` non ripete quella in vista; `pick('farewell')` vale per la disinstallazione;
  - una nuova al massimo ogni 6 s.

## Test
- **`apps/setup` (Vitest):**
  - `App` sceglie il flusso per modalità e `blocked`;
  - `ready` parte dopo il primo disegno;
  - `uninstall-requested` cambia flusso solo a riposo.
- **`Frontispiece`:**
  - 33/26/22px per lunghezza;
  - compatto a 22px;
  - virgolette interne sostituite;
  - opera in `<cite>`.
- **`useQuotes`:** limite di 140 caratteri per il benvenuto, nessuna ripetizione, intervallo di 6 s con i timer finti.
- **`TitleBar`:** chiudi disattivato con `busy`.
- **`ProgressBlock`:** `aria-valuetext` e l'annuncio.
- **`formatBytes`:** `24 MB`, `212,0 GB` in italiano, `212.0 GB` in inglese.
- **`mockBridge`:** ogni scenario restituisce un `SetupInfo` valido.
- **Lingua e tema:** italiano e inglese, classe `dark`.

## Acceptance criteria
- `npm run typecheck -w @bookeeper/setup` e `npm test -w @bookeeper/setup` passano.
- Con `npm run dev -w @bookeeper/setup` e `#scenario=welcome`, una cattura a 800×520 combacia con `01-benvenuto.png` per composizione, misure e testi. Il pannello qui è il segnaposto.
- `impeccable detect --json` pulito sui file cambiati.
