Leggi prima `docs/forge/fase-9b/CONTRATTO.md`, il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Disinstallare», «Accessibilità»), `DESIGN.md` («Zona pericolosa»), il brief `apps/setup/.impeccable/surfaces/src-main-tsx.md` e le bozze `08-disinstalla`, `09-conferma`, `10-disinstallato` in `docs/superpowers/specs/2026-11-27-setup-windows/`. La task `setup-ui-shell` è già unita: usa il suo guscio, i suoi hook e le sue chiavi.

# Il Setup: disinstallare

## File
- `apps/setup/src/uninstall/`: sostituisci il segnaposto con il flusso vero. Un file per pannello, nessuno oltre 250 righe, i test accanto.

## Interfacce
- Usa: `SetupLayout`, `ProgressBlock`, `useQuotes().pick('farewell')`, `formatBytes`, gli hook del ponte; le chiavi `setup.uninstall.*`, `setup.confirm.*`, `setup.removed.*`, `setup.error.*`, `setup.running.*`; `Button`, `Dialog` di `@bookeeper/ui`.
- Produce: `UninstallFlow({ info })`, con la firma del contratto.

## Cosa fare
- **Scelta (`08`):**
  - pannello `tall`, citazione compatta;
  - `uninstall.title` e `uninstall.meta` con versione e cartella installate;
  - due schede in un `role="radiogroup"`, con le frecce che spostano la scelta. «Tieni la libreria» è già selezionata;
  - i testi seguono `info.data`: con `hasEbooks` la variante `textEbooks`; senza `hasLibrary` la variante `textRemote`; il peso con `formatBytes(info.data.bytes)`;
  - la scheda scelta ha il bordo `1.5px` `--bk-accent-control` e `--bk-shadow-2`, come le schede aperte dell'app;
  - comandi «Annulla» (`ghost`, chiama `quit(1)`) e «Disinstalla» (`primary`, salvia, mai rosso).
- **Conferma (`09`):** con «Cancella tutto», «Disinstalla» apre `Dialog tone="danger"`:
  - `confirm.title` o `confirm.titleRemote`;
  - il testo con il peso, e la nota;
  - in fondo «Annulla» (`secondary`) e «Cancella tutto» (`danger`); `closeLabel` = `setup.window.close`;
  - il fuoco iniziale NON è su «Cancella tutto»; Esc chiude.
- **Esecuzione:**
  - `uninstall({ deleteData })` con `ProgressBlock` e il titolo `progress.uninstall`; la barra del titolo è `busy`;
  - `app_running` porta al pannello «Chiudi Bookeeper per continuare», con «Riprova»;
  - gli altri errori portano a `error.uninstall`, con «Copia i dettagli» e «Riprova».
- **Fine (`10`):** `removed.title` con `removed.kept` o `removed.deleted`, e «Chiudi» (`primary`, `quit(0)`).
- **Fuoco:** a ogni cambio di stato va al titolo del pannello.

## Test (Vitest, ponte finto)
- «Tieni la libreria» è già scelta; «Disinstalla» chiama `uninstall({ deleteData: false })` senza conferma.
- Le frecce spostano la scelta nel gruppo.
- «Cancella tutto» apre la conferma:
  - «Annulla» la chiude senza disinstallare;
  - «Cancella tutto» chiama `uninstall({ deleteData: true })`;
  - il fuoco iniziale non è su «Cancella tutto»; Esc chiude.
- Varianti dei testi con `hasEbooks` e senza `hasLibrary`, nelle schede e nella conferma.
- «Annulla» nella scelta chiama `quit(1)`.
- `app_running` e un errore mostrano i pannelli giusti.
- La fine mostra `kept` o `deleted`; «Chiudi» chiama `quit(0)`.
- Il fuoco va al titolo a ogni stato.

## Acceptance criteria
- `npm run typecheck -w @bookeeper/setup` e `npm test -w @bookeeper/setup` passano.
- Con `npm run dev -w @bookeeper/setup`, le catture a 800×520 degli scenari `uninstall`, `uninstall-ebooks`, `uninstall-remote` e `removed`, e della conferma aperta, combaciano con le bozze per composizione, misure e testi.
- `impeccable detect --json` pulito sui file cambiati.
