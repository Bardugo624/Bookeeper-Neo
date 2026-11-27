# Contratto del run 9B: Bookeeper Setup

Prima di ogni task leggi:
- il design approvato, `docs/superpowers/specs/2026-11-27-setup-windows-design.md`;
- `docs/forge/fase-9b/request.md`;
- per l'interfaccia: il brief `apps/setup/.impeccable/surfaces/src-main-tsx.md`, le bozze in `docs/superpowers/specs/2026-11-27-setup-windows/`, `DESIGN.md` e `PRODUCT.md`.

Qui ci sono i valori fissati, le interfacce che le task si scambiano e le regole.

## Valori fissati

- **Crate:**
  - `crates/bookeeper-setup-core` (`bookeeper-setup-core`, libreria `bookeeper_setup_core`), senza Tauri;
  - `apps/setup/src-tauri` (`bookeeper-setup`, eseguibile `bookeeper-setup.exe`);
  - entrambe con `version.workspace = true` e `edition.workspace = true`.
- **Pacchetto npm:** `apps/setup`, nome `@bookeeper/setup`, `private: true`, con la versione del repository.
- **Identificatore Tauri del Setup:** `org.bookeeper.setup`. Quello dell'app resta `org.bookeeper.desktop`.
- **Nomi dei file:**
  - Setup completo: `Bookeeper-Setup-<versione>.exe`;
  - Setup leggero, installato da NSIS: `<cartella>\bookeeper-setup.exe`;
  - installer NSIS: `Bookeeper_<versione>_x64-setup.exe`, come oggi;
  - registro del Setup: `%TEMP%\Bookeeper-Setup.log`.
- **Coda:** come nel design, «Il file che si scarica». `MAGIC = b"BKSETUP1"`, 24 byte, metadati JSON con chiavi in `snake_case`.
- **Registro di Windows** (tutto in `HKCU`):
  - `Software\Microsoft\Windows\CurrentVersion\Uninstall\Bookeeper`: `DisplayVersion`, `InstallLocation` (fra virgolette), `UninstallString`, `QuietUninstallString`;
  - `Software\bookeeper\Bookeeper`: valore predefinito = cartella, senza virgolette;
  - `Software\Microsoft\Windows\CurrentVersion\Run`, valore `Bookeeper` = `"<cartella>\bookeeper-desktop.exe" --autostart`;
  - `Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run`, valore `Bookeeper`, `REG_BINARY` di 12 byte: acceso = `02` seguito da 11 zeri. Un primo byte dispari vuol dire spento.
- **Cartelle dei dati dell'app:** `%APPDATA%\org.bookeeper.desktop` e `%LOCALAPPDATA%\org.bookeeper.desktop`. La libreria è `bookeeper.sqlite`, gli e-book stanno in `ebooks\`.
- **Credenziali:** si cancellano tutte quelle il cui nome finisce in `.org.bookeeper.desktop`.
- **Collegamenti:** `<FOLDERID_Desktop>\Bookeeper.lnk` (facoltativo) e `<FOLDERID_Programs>\Bookeeper.lnk` (sempre).
- **Righe di comando**, scritte con `CommandExt::raw_arg`, mai con `arg`:
  - installare: `/S /D=<cartella>`;
  - aggiornare o riparare: `/S /UPDATE /D=<cartella>`;
  - disinstallare: `/S _?=<cartella>`.

  Nessuna virgoletta attorno alla cartella, anche con gli spazi. Il percorso del programma va fra virgolette.
- **Modalità silenziosa e codici d'uscita:** come nel design. `0` fatto, `1` annullato, `2` errore, `3` Bookeeper aperto, `4` versione più recente o 0.x. Con `BOOKEEPER_SETUP_ALLOW_ELEVATED=1` la sola modalità silenziosa accetta i permessi di amministratore: serve ai runner di GitHub, che girano da amministratore.
- **Tempi:**
  - NSIS: al massimo 10 minuti, poi si chiude il processo;
  - avanzamento: un evento ogni 100 ms;
  - ogni passo almeno 600 ms, tutta l'operazione almeno 3 s;
  - citazioni: al massimo una nuova ogni 6 s.
- **Spazio:** `installed_bytes` più 50 MB sul disco della cartella; il peso dell'installer sul disco di `%TEMP%`. Percorso: al massimo 200 caratteri.
- **Finestra del Setup:** 800×520, senza cornice, non ridimensionabile, al centro, invisibile finché l'interfaccia non chiama `ready`.
- **Versioni:** `@tauri-apps/cli` esattamente `2.12.6`, nell'app e nel Setup.

## Interfacce fra le task

### `bookeeper-setup-core` (task `setup-core-logic`, `setup-core-ops`, `setup-core-win`)

`setup-core-logic` crea tutti i moduli. Dichiara in `lib.rs`:
- `payload`, `version`, `cmdline`, `folder`, `progress`, `sys`;
- `ops`, `quiet`, `log` (li riempie `setup-core-ops`);
- `autostart` (lo riempie `setup-core-win`).

Le task successive toccano solo i propri file.

```rust
// payload.rs
pub struct FileMeta { pub name: String, pub bytes: u64, pub sha256: String }
pub struct Meta { pub version: String, pub payload: FileMeta, pub main: FileMeta, pub installed_bytes: u64 }
pub struct Located { pub meta: Meta, pub payload_offset: u64, pub payload_len: u64 }
pub enum PayloadError { BadLengths, BadMeta(String), Io(std::io::Error) }
pub fn locate<R: Read + Seek>(r: &mut R, len: u64) -> Result<Option<Located>, PayloadError>; // None: nessuna coda
pub fn encode_tail(meta: &Meta, payload_len: u64) -> Vec<u8>; // metadati + coda, per i test e per chi assembla

// version.rs
pub fn compare(a: &str, b: &str) -> Option<std::cmp::Ordering>;
pub fn is_legacy(v: &str) -> bool; // sotto la 2.0.0

// cmdline.rs
pub fn install_args(dir: &Path, update: bool) -> String;
pub fn uninstall_args(dir: &Path) -> String;
pub struct UninstallArgs { pub passive: bool, pub quiet: bool, pub delete_data: bool, pub dir: Option<PathBuf> }
pub struct QuietInstallArgs { pub dir: Option<PathBuf>, pub desktop_icon: bool, pub autostart: bool }
pub enum Invocation { Gui, SmokeUi, QuietInstall(QuietInstallArgs), Uninstall(UninstallArgs) }
pub fn parse_invocation(raw: &str) -> Result<Invocation, String>; // la riga grezza, programma compreso

// folder.rs
pub fn target_for_choice(chosen: &Path, chosen_is_empty: bool) -> PathBuf;
pub enum FolderProblem { NotAbsolute, Network, NeedsAdmin, TooLong, TooLittleSpace { free: u64 }, TempTooSmall { free: u64 } }
pub const SPACE_MARGIN: u64 = 50 * 1024 * 1024;
pub const MAX_PATH_CHARS: usize = 200;
pub fn check_space(free_target: u64, free_temp: u64, installed_bytes: u64, payload_bytes: u64) -> Option<FolderProblem>;

// progress.rs
pub enum Step { Prepare, Copy, Icons, Finish, RemoveApp, RemoveData }
pub enum Signal { Tick, Extracted, Unpacked { bytes: u64, total: u64 }, MainComplete, NsisExited, IconsDone, AppRemoved, DataRemoved, Finished }
pub struct Snapshot { pub step: Step, pub fraction: f32, pub done: bool }
pub struct ProgressModel; // new_install(start, estimate), new_uninstall(start, estimate, delete_data), observe(now, signal) -> Snapshot

// sys/mod.rs
pub struct InstallState { pub dir: PathBuf, pub version: String }
pub enum RunOutcome { Exited(i32), TimedOut }
pub trait System: Send + Sync {
    fn install_state(&self) -> std::io::Result<Option<InstallState>>;
    fn app_data(&self) -> PathBuf;
    fn local_app_data(&self) -> PathBuf;
    fn temp_dir(&self) -> PathBuf;
    fn desktop_dir(&self) -> PathBuf;
    fn programs_dir(&self) -> PathBuf;
    fn free_space(&self, path: &Path) -> std::io::Result<u64>;
    fn is_network_path(&self, path: &Path) -> bool;
    fn can_write(&self, dir: &Path) -> std::io::Result<bool>;
    fn is_running(&self, exe: &Path) -> std::io::Result<bool>;
    fn is_elevated(&self) -> bool;
    fn has_webview2(&self) -> bool;
    fn run_and_wait(&self, program: &Path, raw_args: &str, env: &[(OsString, OsString)], timeout: Duration) -> std::io::Result<RunOutcome>;
    fn shortcut_target(&self, lnk: &Path) -> std::io::Result<Option<PathBuf>>;
    fn autostart_enable(&self, exe: &Path) -> std::io::Result<()>;
    fn autostart_disable(&self) -> std::io::Result<()>;
    fn autostart_is_enabled(&self) -> std::io::Result<bool>;
    fn delete_credentials_with_suffix(&self, suffix: &str) -> std::io::Result<usize>;
    fn delete_registry_tree(&self, hkcu_key: &str) -> std::io::Result<()>;
    fn delete_registry_key_if_empty(&self, hkcu_key: &str) -> std::io::Result<()>;
    fn self_delete_outside(&self, dir: &Path) -> std::io::Result<()>;
}
pub struct MockSystem; // in memoria, su cartelle temporanee vere; per i test di ogni piattaforma
pub fn platform() -> Box<dyn System>; // Windows: WindowsSystem (task setup-core-win); altrove: un sistema che risponde Unsupported

// ops.rs (setup-core-ops)
pub enum Mode { Install, Update, Repair }
pub struct InstallOptions { pub dir: PathBuf, pub desktop_icon: bool, pub autostart: bool, pub mode: Mode }
pub struct DataSummary { pub bytes: u64, pub has_library: bool, pub has_ebooks: bool }
pub enum OpError { AppRunning, Payload(String), NsisFailed { code: i32 }, TimedOut, Verification(String), Io(String) }
pub fn install(sys: &dyn System, setup_exe: &Path, opts: &InstallOptions, report: &mut dyn FnMut(Snapshot), log: &Log) -> Result<(), OpError>;
pub fn uninstall(sys: &dyn System, dir: &Path, delete_data: bool, report: &mut dyn FnMut(Snapshot), log: &Log) -> Result<(), OpError>;
pub fn data_summary(sys: &dyn System) -> DataSummary;

// quiet.rs (setup-core-ops)
pub fn run(sys: &dyn System, invocation: &Invocation, setup_exe: &Path) -> i32;

// log.rs (setup-core-ops)
pub struct Log; // open(sys), line(&str), tail(n) -> String

// autostart.rs (setup-core-win), usato anche dall'app desktop
pub fn enable(exe: &Path) -> std::io::Result<()>;
pub fn disable() -> std::io::Result<()>;
pub fn is_enabled() -> std::io::Result<bool>; // fuori da Windows: ErrorKind::Unsupported
```

Questi nomi e tipi sono vincolanti. I campi privati, gli errori interni e i dettagli dei test li decide chi scrive la task.

### Comandi del Setup (task `setup-app`) e ponte dell'interfaccia (task `setup-ui-shell`)

JSON in `camelCase`. Il ponte (`apps/setup/src/bridge/`) espone gli stessi nomi in TypeScript, con un ponte finto per il browser e per i test.

```ts
interface SetupInfo {
  mode: 'install' | 'uninstall';
  payload: { version: string; installedBytes: number } | null; // null nel Setup leggero
  installed: { version: string; dir: string; legacy: boolean } | null;
  defaults: { dir: string; desktopIcon: boolean; autostart: boolean };
  blocked: null | 'elevated' | 'incomplete' | 'unsupported';
  data: { bytes: number; hasLibrary: boolean; hasEbooks: boolean };
}
type FolderProblem = 'needs_admin' | 'network' | 'not_absolute' | 'too_long' | 'too_little_space' | 'temp_too_small';
interface DirCheck { dir: string; problem: FolderProblem | null; freeBytes: number; drive: string }
type Mode = 'install' | 'update' | 'repair';
interface InstallRequest { dir: string; desktopIcon: boolean; autostart: boolean; mode: Mode }
type StepId = 'prepare' | 'copy' | 'icons' | 'finish' | 'removeApp' | 'removeData';
interface ProgressEvent { step: StepId; fraction: number; done: boolean }
type OpResult = { ok: true } | { ok: false; error: 'app_running' | 'payload' | 'nsis_failed' | 'timeout' | 'verification' | 'io'; code?: number };
```

| Comando | Argomenti | Risposta |
|---|---|---|
| `setup_info` | — | `SetupInfo` |
| `check_dir` | `{ dir }` | `DirCheck`, con la cartella già corretta da `target_for_choice` |
| `install` | `{ request: InstallRequest }` | `OpResult`; avanzamento con l'evento `setup://progress` |
| `uninstall` | `{ deleteData: boolean }` | `OpResult`; avanzamento con `setup://progress` |
| `launch_app` | — | avvia `bookeeper-desktop.exe` |
| `log_tail` | — | le ultime 200 righe del registro |
| `ready` | — | mostra la finestra |
| `quit` | `{ code: number }` | chiude il Setup con quel codice |

- La cartella si sceglie con `open({ directory: true })` di `@tauri-apps/plugin-dialog`.
- Un secondo avvio con `--uninstall` emette `setup://uninstall-requested`.
- Il **Setup leggero** (senza coda) è in modalità `uninstall` se è partito con `--uninstall`, oppure se sta nella cartella installata. Altrimenti `blocked` vale `incomplete`.

### Interfaccia (task `setup-ui-base`, `setup-ui-shell`, `setup-ui-install`, `setup-ui-uninstall`)

- `setup-ui-base` scrive tutti i testi, le icone nuove del kit, `valueText` di `FillBar` e `apps/setup/src/quotes.json`.
- `setup-ui-shell` crea l'app, il ponte, la barra del titolo, il frontespizio e due segnaposto:
  - `src/install/index.tsx`: `export function InstallFlow(props: { info: SetupInfo; onUninstall(): void })`;
  - `src/uninstall/index.tsx`: `export function UninstallFlow(props: { info: SetupInfo })`.

  `setup-ui-install` e `setup-ui-uninstall` sostituiscono solo la propria cartella.
- **Il guscio** (`src/shell/`) espone:
  - `<SetupLayout quote={QuoteRef} compact={boolean} panelHeight={'short' | 'tall'}>{pannello}</SetupLayout>`: frontespizio sopra, pannello sotto, movimento come nel design;
  - `useQuotes(): { pick(kind: 'welcome' | 'progress' | 'farewell'): QuoteRef }`;
  - `useProgress(): ProgressEvent | null`, l'ultimo evento.
- **Testi:** tutti in `packages/i18n/src/locales/{it,en}/setup.json`, scritti da `setup-ui-base`. Le altre task usano le chiavi, senza aggiungerne. Le chiavi e i testi italiani sono nell'elenco qui sotto.

### Chiavi dei testi (`setup.*`)

Italiano. L'inglese lo scrive `setup-ui-base`, con lo stesso tono.

| Chiave | Testo |
|---|---|
| `window.minimize` / `window.close` / `window.busy` | «Riduci» / «Chiudi» / «Aspetta la fine dell'installazione» |
| `install.title` | «Installa Bookeeper» |
| `install.meta` | «Versione {version} · {size}» |
| `install.icons.both` / `install.icons.start` | «Icona sul desktop e nel menu Start» / «Nel menu Start» |
| `install.autostart` | «Si apre all'accesso a Windows» |
| `install.customize` / `install.go` | «Personalizza» / «Installa» |
| `customize.title` / `customize.meta` / `customize.less` | «Personalizza» / «Bookeeper {version}» / «Meno scelte» |
| `customize.folder` / `customize.change` | «Cartella» / «Cambia…» |
| `customize.space` | «Servono {need}. Sul disco {drive} restano {free} liberi.» |
| `customize.problem.needs_admin` | «Questa cartella chiede i permessi di amministratore. Scegline una nella tua cartella utente.» |
| `customize.problem.network`, `customize.problem.not_absolute` | «Scegli una cartella di questo computer.» |
| `customize.problem.too_long` | «Il percorso è troppo lungo. Scegli una cartella più vicina all'inizio del disco.» |
| `customize.problem.too_little_space` | «Su questo disco c'è troppo poco spazio: restano {free}.» |
| `customize.problem.temp_too_small` | «Sul disco dei file temporanei c'è troppo poco spazio: restano {free}.» |
| `customize.desktop` | «Icona sul desktop» |
| `customize.startMenu` | «Bookeeper è sempre nel menu Start: serve alle notifiche di Windows.» |
| `customize.autostart` / `customize.autostartNote` | «Apri Bookeeper all'accesso a Windows» / «Si apre ridotto a icona. Se condividi la libreria in rete, i telefoni la trovano finché il computer è acceso.» |
| `progress.install` / `.update` / `.repair` / `.uninstall` | «Sto installando Bookeeper» / «Sto aggiornando Bookeeper» / «Sto riparando Bookeeper» / «Sto disinstallando Bookeeper» |
| `progress.step.prepare` / `.copy` / `.icons` / `.finish` | «Preparo l'installazione» / «Copio i file» / «Creo le icone» / «Ultimi ritocchi» |
| `progress.step.removeApp` / `.removeData` | «Tolgo l'app» / «Cancello i dati» |
| `progress.valueText` | «{step}, {percent}%» |
| `done.install` / `done.update` / `done.repair` | «Bookeeper è pronto» / «Bookeeper è aggiornato» / «Bookeeper è riparato» |
| `done.whereBoth` / `done.whereStart` | «Lo trovi sul desktop e nel menu Start.» / «Lo trovi nel menu Start.» |
| `done.open` / `done.close` | «Apri Bookeeper» / «Chiudi» |
| `running.title` / `running.text` / `running.retry` | «Chiudi Bookeeper per continuare» / «L'app è aperta su questo computer. Chiudila, poi premi «Riprova».» / «Riprova» |
| `error.install` / `error.uninstall` | «L'installazione si è fermata» / «La disinstallazione si è fermata» |
| `error.text` | «Riprova. Se si ferma di nuovo, copia i dettagli e mandali a chi ti aiuta.» |
| `error.copy` / `error.copied` / `error.retry` | «Copia i dettagli» / «Dettagli copiati» / «Riprova» |
| `maintenance.older.title` / `.text` / `.go` | «Aggiorna Bookeeper» / «Su questo computer c'è la {installed}. La {version} lascia la tua libreria com'è, nella stessa cartella.» / «Aggiorna» |
| `maintenance.same.title` / `.text` / `.repair` | «Bookeeper {version} è già installato» / «Puoi ripararlo, se qualcosa non va, o disinstallarlo.» / «Ripara» |
| `maintenance.newer.title` / `.text` | «C'è già una versione più recente» / «Su questo computer c'è la {installed}. Una libreria della {installed} non si apre con la {version}: per tornare indietro bisogna disinstallare con «Cancella tutto».» |
| `maintenance.legacy.title` / `.text` | «C'è una versione molto vecchia» / «Su questo computer c'è Bookeeper {installed}. Disinstallala da Impostazioni › App, poi riapri il Setup.» |
| `maintenance.uninstall` | «Disinstalla» |
| `blocked.incomplete.title` / `.text` | «Il file scaricato è incompleto» / «Scaricalo di nuovo, poi riapri il Setup.» |
| `blocked.elevated.title` / `.text` | «Apri il Setup senza permessi di amministratore» / «Bookeeper si installa per il tuo utente. Chiudi questa finestra e apri il Setup con un doppio clic.» |
| `blocked.unsupported.title` / `.text` | «Questo Setup è per Windows» / «Su questo sistema installa Bookeeper con il pacchetto adatto.» |
| `uninstall.title` / `uninstall.meta` | «Disinstalla Bookeeper» / «Versione {version} · in {dir}» |
| `uninstall.keep.title` | «Tieni la libreria» |
| `uninstall.keep.text` / `.textEbooks` / `.textRemote` | «Libri, copertine e backup restano su questo computer. Se reinstalli, li ritrovi.» / «Libri, copertine, e-book e backup restano su questo computer. Se reinstalli, li ritrovi.» / «I collegamenti alle librerie su server restano su questo computer. Se reinstalli, li ritrovi.» |
| `uninstall.delete.title` | «Cancella tutto» |
| `uninstall.delete.text` / `.textEbooks` / `.textRemote` | «Toglie anche la libreria di questo computer: {size}, con copertine e backup.» / «Toglie anche la libreria di questo computer: {size}, con copertine, e-book e backup.» / «Toglie anche i dati salvati su questo computer: {size}, con i collegamenti alle librerie su server.» |
| `uninstall.cancel` / `uninstall.go` | «Annulla» / «Disinstalla» |
| `confirm.title` / `confirm.titleRemote` | «Cancellare tutta la libreria?» / «Cancellare i dati di Bookeeper?» |
| `confirm.text` / `.textEbooks` / `.textRemote` | «Spariscono da questo computer i libri, le copertine e i backup automatici: {size}. Non si può annullare.» / «Spariscono da questo computer i libri, le copertine, gli e-book e i backup automatici: {size}. Non si può annullare.» / «Spariscono da questo computer i collegamenti alle librerie e i dati salvati: {size}. Non si può annullare.» |
| `confirm.note` | «Le librerie su un server restano dove sono.» |
| `confirm.cancel` / `confirm.go` | «Annulla» / «Cancella tutto» |
| `removed.title` / `removed.kept` / `removed.deleted` / `removed.close` | «Bookeeper è stato disinstallato» / «La tua libreria è ancora su questo computer: se reinstalli Bookeeper, la ritrovi.» / «Su questo computer non restano i tuoi dati di Bookeeper.» / «Chiudi» |

I pesi (`{size}`, `{need}`, `{free}`) si scrivono con `formatBytes(bytes, locale)` di `apps/setup/src/shell/format.ts`: MB senza decimali sotto 1 GB, GB con un decimale sopra.

### Assemblaggio (task `setup-assemble`)

```
node scripts/setup/assemble.mjs --setup <bookeeper-setup.exe> --payload <installer NSIS> --main <bookeeper-desktop.exe> --version <v> --out <Bookeeper-Setup-v.exe>
```

- Esporta `assemble(opts)` e `readTail(buffer)` per i test.
- Stampa lo SHA-256 del file prodotto.
- Il formato è quello di `payload.rs`: un test Rust e un test Node leggono lo stesso file di esempio, `crates/bookeeper-setup-core/tests/fixtures/tail.bin`, scritto da `setup-core-logic`.

## Regole

- **Dipendenze:**
  - Rust: solo quelle già in `Cargo.lock` (`serde`, `serde_json`, `sha2` 0.10, `semver`, `thiserror` 2, `winreg` 0.56, `windows-sys` 0.59, `windows` 0.62, `tempfile`, `tauri-plugin-dialog`), più `self-replace`, `tauri-plugin-single-instance` e `tauri-plugin-autostart`;
  - npm: `@tauri-apps/api`, `@tauri-apps/plugin-dialog`, `@tauri-apps/cli` `2.12.6`;
  - nessun'altra senza un motivo scritto nel rapporto.
- **Codice solo-Windows:** dietro `#[cfg(windows)]`. DEVE passare `cargo check --target x86_64-pc-windows-msvc -p bookeeper-setup-core` (il target è già installato). Su Linux ci sono implementazioni finte o `Unsupported`: `cargo test --workspace` e `cargo clippy --workspace --all-targets -- -D warnings` passano sempre.
- **Interfaccia:** Impeccable in modalità **Operate** (`.claude/skills/impeccable/`):
  - setup con `impeccable context --target apps/setup/src/main.tsx`;
  - `reference/craft-floor.md` prima di ogni modifica;
  - `impeccable detect --json` pulito alla fine.

  La composizione è quella delle bozze approvate: misure, gerarchia e testi. Il salvataggio remoto dei rapporti NON si usa. Non proporre alternative di design: decidi secondo questa consegna e `DESIGN.md`, e scrivi nel rapporto cosa hai deciso.
- **Regole di sempre:**
  - nessun componente oltre 250 righe;
  - nessun testo nei componenti;
  - nessuna chiamata al ponte dentro un componente: passano dagli hook;
  - nessun colore letterale; solo `transform` e `opacity` nelle animazioni;
  - WCAG 2.2 AA;
  - ogni comportamento ha un test.
- **Ambito:** ogni task tocca solo i file dichiarati.
- **Rischi:**
  - nessuna modifica a `ops/`, ai workflow `vps-*.yml`, al servizio degli aggiornamenti o a `scripts/updates-r2.mjs`;
  - nessuna chiamata esterna dalle task: niente push, tag, release o richieste a GitHub.
- **Lingua:** testi per le persone in italiano e inglese, frasi brevi; commenti nel codice in inglese, solo dove servono.

## Cose che più facilmente farebbero male, e dove sono provate

1. **Una cartella con uno spazio e una lettera accentata** (`C:\Users\Mario Rossi\AppData\Local\Bookeeper`, `C:\Prova Bookeeper\Libreria è`). NSIS ignora `/D=` e `_?=` fra virgolette. Lo provano `setup-core-logic` (la riga esatta, carattere per carattere) e la prova di fumo di `setup-workflows`.
2. **La pagina di reinstallazione dell'installer classico** lancia il disinstallatore con `/P _?=<cartella con spazi>` e aspetta. Deve finire solo a lavoro fatto, con 0. Lo provano `setup-core-logic` (lettura della riga), `setup-core-ops` (nessun rilancio: tutto nello stesso processo) e la prova di fumo.
3. **Un aggiornamento automatico** (`/P /UPDATE`) deve lasciare registrato il disinstallatore di marchio. Lo provano `setup-assemble` (il gancio definisce la cartella fuori dalle macro) e la prova di fumo, che lancia l'installer con `/P /UPDATE` sopra un'installazione e ricontrolla `UninstallString`.
4. **«Cancella tutto» con credenziali non elencate in `connections.json`.** Spariscono tutte quelle con il suffisso. Lo provano `setup-core-ops` (sistema finto), `setup-core-win` (su Windows, in CI) e la prova di fumo.
5. **Un'installazione velocissima o un aggiornamento.** La barra non resta ferma, non salta indietro e non arriva al 90% prima che `bookeeper-desktop.exe` sia completo. In un aggiornamento il vecchio `bookeeper-desktop.exe` non conta. Lo prova `setup-core-logic`, sul modello dell'avanzamento.
