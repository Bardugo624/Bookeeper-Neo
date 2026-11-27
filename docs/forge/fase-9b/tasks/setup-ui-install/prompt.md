Leggi prima `docs/forge/fase-9b/CONTRATTO.md`, il design `docs/superpowers/specs/2026-11-27-setup-windows-design.md` («Installare», «Personalizzare», «Icone e notifiche», «Aggiornare e riparare», «Accessibilità»), il brief `apps/setup/.impeccable/surfaces/src-main-tsx.md` e le bozze `01-benvenuto`, `02-personalizza`, `03-in-corso`, `04-fatto`, `05-app-aperta`, `06-errore`, `07-aggiorna` in `docs/superpowers/specs/2026-11-27-setup-windows/`. La task `setup-ui-shell` è già unita: usa il suo guscio, i suoi hook e le sue chiavi.

# Il Setup: installare, personalizzare, aggiornare

## File
- `apps/setup/src/install/`: sostituisci il segnaposto con il flusso vero. Un file per pannello, nessuno oltre 250 righe, i test accanto.

## Interfacce
- Usa: `SetupLayout`, `ProgressBlock`, `useQuotes`, `formatBytes` e gli hook del ponte di `setup-ui-shell`; le chiavi `setup.*` del contratto; `Button`, `IconButton`, `Icon`, `Tooltip` di `@bookeeper/ui`.
- Produce: `InstallFlow({ info, onUninstall })`, con la firma del contratto.

## Cosa fare
- **Stati:** `welcome`, `customize`, `running`, `progress`, `done`, `error`, `maintenance`.
  - Si parte da `maintenance` se `info.installed` non è `null` (più vecchia, stessa, più nuova, 0.x).
  - Si parte da `welcome` se non c'è un'installazione.
- **Benvenuto (`01`):** `install.title`, `install.meta`, riassunto con icona `folder` e cartella, icona `monitor` e `install.icons.*`, icona `power` e `install.autostart` solo se è acceso. Comandi «Personalizza» (`secondary`) e «Installa» (`primary`).
- **Personalizza (`02`):**
  - pannello `tall` e citazione compatta; «Meno scelte» (`ghost`, `chevron-up`) torna al benvenuto e tiene le scelte;
  - campo «Cartella» in sola lettura con «Cambia…»: la finestra di sistema, poi `check_dir`;
  - sotto il campo, `customize.space` oppure il problema in `--bk-danger-strong`, collegato al campo con `aria-describedby`. Con un problema «Installa» è disattivato;
  - interruttore «Icona sul desktop» (casella con `role="switch"`, come nell'app);
  - riga fissa `customize.startMenu` con l'icona `check`;
  - interruttore «Apri Bookeeper all'accesso a Windows» con la nota.
- **«Installa», «Aggiorna», «Ripara»:**
  - chiamano `install` con la modalità giusta;
  - `app_running` porta a `running` (`05`), dove «Riprova» rilancia la stessa richiesta;
  - gli altri errori portano a `error` (`06`), dove «Copia i dettagli» copia `log_tail` con `navigator.clipboard` e mostra `error.copied`, e «Riprova» rilancia;
  - durante l'operazione la barra del titolo ha `busy`, e la citazione cambia con `pick('progress')`.
- **Avanzamento (`03`):** `ProgressBlock` con il titolo della modalità e il testo del passo. Si va a `done` solo con `done: true`.
- **Fatto (`04`):**
  - icona `check` in un cerchio `--bk-accent-surface`;
  - `done.*` con `whereBoth` o `whereStart`;
  - «Chiudi» (`ghost`, chiama `quit(0)`) e «Apri Bookeeper» (`primary`, chiama `launch_app`).
- **Manutenzione (`07`):** le tre righe della tabella del design più la 0.x. «Disinstalla» (`ghost`) chiama `onUninstall`. Con la 0.x e con una versione più nuova non c'è nessun comando che installa.
- **Fuoco:** a ogni cambio di stato va al titolo del pannello (`tabIndex={-1}`). Il comando principale è il primo bottone pieno, senza scorciatoie globali.

## Test (Vitest, ponte finto)
- Il benvenuto mostra cartella e icone; «Installa» chiama `install` con le scelte predefinite e `mode: 'install'`.
- «Personalizza»:
  - cambia cartella, icona sul desktop e apertura all'accesso;
  - «Meno scelte» tiene le scelte;
  - un problema della cartella mostra il testo, lo collega al campo e disattiva «Installa».
- `app_running` porta a «Chiudi Bookeeper», e «Riprova» rilancia.
- Un errore porta a «L'installazione si è fermata»; «Copia i dettagli» scrive negli appunti.
- L'avanzamento non va a «Fatto» prima di `done: true`; la barra del titolo è `busy`.
- «Fatto»: testo giusto con e senza icona sul desktop; «Apri Bookeeper» chiama `launch_app`.
- Manutenzione: più vecchia, stessa, più nuova e 0.x, con i comandi giusti; «Disinstalla» chiama `onUninstall`.
- Il fuoco va al titolo a ogni stato.

## Acceptance criteria
- `npm run typecheck -w @bookeeper/setup` e `npm test -w @bookeeper/setup` passano.
- Con `npm run dev -w @bookeeper/setup`, le catture a 800×520 degli scenari `welcome`, `customize`, `progress`, `done`, `running`, `error`, `older` e `dark` combaciano con le bozze per composizione, misure e testi.
- `impeccable detect --json` pulito sui file cambiati.
