# Bookeeper Setup per Windows e sfondo del DMG — design

Data: 2026-11-27. Stato: bozza, da approvare. Il documento è passato da un controllo indipendente: le risposte sono qui dentro. Le schermate approvate stanno in `2026-11-27-setup-windows/`, accanto a questo file.

## Perché

- L'installer Windows di oggi è quello standard di Tauri (NSIS): finestre classiche, in inglese, senza marchio.
- Il proprietario vuole un installer «custom e brandizzato, che dia un senso premium e richiami il più possibile la UI/UX dell'app».
- Vuole anche un'installazione personalizzabile e un disinstallatore.

## Decisioni del proprietario

- **Strada A:** un piccolo «Bookeeper Setup» fatto come l'app, con dentro l'installer NSIS di oggi che lavora in silenzio.
- **Impeccable** per il disegno.
- **Scelte offerte:** la cartella, l'icona sul desktop, la voce nel menu Start, l'apertura all'accesso a Windows. NON l'installazione per tutti gli utenti.
- **Disinstallare:** si sceglie fra tenere la libreria e cancellare tutto. «Tieni la libreria» è già selezionato. «Cancella tutto» chiede una conferma rossa che dice cosa si perde.
- **Struttura:** «La citazione», scelta fra tre strutture estratte. In alto un frontespizio con la citazione di uno scrittore, sotto un solo pannello di lavoro.
- **Da decidere:** la voce nel menu Start. Vedi «Icone e notifiche».

## Obiettivi

1. Chi scarica Bookeeper per Windows riceve `Bookeeper-Setup-<versione>.exe`: una finestra con l'aspetto dell'app, che installa con un tasto.
2. «Personalizza» cambia cartella, icone e apertura all'accesso.
3. Il Setup riconosce un'installazione esistente e propone di aggiornarla, ripararla o disinstallarla.
4. Da «App» nelle Impostazioni di Windows, «Disinstalla» apre il disinstallatore di Bookeeper, anche dopo gli aggiornamenti automatici.
5. Gli aggiornamenti dall'app continuano a funzionare come oggi, in silenzio.
6. Nell'app, una nuova scelta nelle Impostazioni accende e spegne l'apertura all'accesso.
7. Sul Mac, il DMG ha uno sfondo del marchio e la freccia verso Applicazioni.

## Non obiettivi

- La firma del codice: Windows continuerà a mostrare «Editore sconosciuto» prima di aprire il Setup.
- L'installazione per tutti gli utenti, in Programmi, con i permessi di amministratore.
- Un installer che scarica l'app da internet.
- Cambiare il meccanismo degli aggiornamenti.
- Linux: AppImage e deb restano come sono.
- Spostare un'installazione esistente in un'altra cartella: si disinstalla e si reinstalla.
- Passare dalla 0.x alla 2.x: resta escluso, come nel design della 2.0.

## Cosa sarebbe un fallimento anche se funziona

- Il Setup somiglia all'app solo nelle schermate: su Windows mostra un lampo bianco, una barra del titolo di sistema, o testo sfocato al 125% e al 150%.
- Dopo il primo aggiornamento automatico, «Disinstalla» torna a aprire la finestra classica di NSIS.
- Una release esce con il disinstallatore classico senza che nessuno se ne accorga.
- «Cancella tutto» lascia token nel Gestore credenziali di Windows, oppure «Tieni la libreria» perde qualcosa.
- La barra di avanzamento resta ferma e poi salta alla fine.
- Una cartella con uno spazio nel nome, come `C:\Users\Mario Rossi`, rompe l'installazione o la disinstallazione.
- Windows chiede i permessi di amministratore.
- Le notifiche di Bookeeper smettono di arrivare.
- Il link di download per Windows porta ancora all'installer classico.

## Approcci considerati

**Come presentare l'installer.** Tre strade, proposte al proprietario:
- **A, scelta:** una mini-app Tauri con i componenti dell'app, che comanda NSIS in silenzio.
- **B:** NSIS «in un clic» con un'immagine del marchio. Più economica, ma resta una finestra di Windows con un'immagine sopra.
- **C:** la procedura classica di NSIS con le immagini del marchio, come nella 0.1. La meno premium.

**Come il Setup porta con sé l'installer NSIS.**
- Compilarlo dentro con `include_bytes!`: servono due compilazioni, perché lo stesso programma deve stare anche dentro l'installer NSIS, come disinstallatore.
- **Scelta: accodarlo all'eseguibile.** Si compila il Setup una volta sola. Il file che si scarica è il Setup, seguito dall'installer NSIS, dai metadati e da una coda di 24 byte. Lo stesso Setup senza nulla in coda è il disinstallatore che NSIS installa. È la tecnica degli archivi autoestraenti, che NSIS stesso usa.

**Come rispettare le scelte delle icone.**
- Passare `/NS` a NSIS e creare noi i collegamenti: bisognerebbe rifare l'AppUserModelID che NSIS imposta sui collegamenti.
- **Scelta: lasciare che NSIS crei i collegamenti, poi togliere quelli non voluti.** Negli aggiornamenti NSIS non li ricrea, quindi la scelta resta.

**Come il disinstallatore toglie sé stesso.**
- Copiarsi in `%TEMP%`, rilanciarsi da lì e uscire: chi aspetta la fine (Windows, la pagina di NSIS, la modalità silenziosa) la vedrebbe subito, a lavoro non fatto.
- **Scelta: lavorare sul posto** e, alla fine, spostare il proprio eseguibile fuori dalla cartella con `self_replace::self_delete_outside_path`. Il processo resta lo stesso dall'inizio alla fine, e il codice d'uscita è quello vero.

## Com'è oggi

Fatti verificati nel modello NSIS di Tauri (`tauri-cli` 2.12.6), nei sorgenti di NSIS 3 e con una prova di `makensis`:

- **Installazione:**
  - `installMode` vale `currentUser`: l'app si installa in `%LOCALAPPDATA%\Bookeeper` senza permessi di amministratore;
  - la compressione è LZMA solida: NSIS scompatta tutto in un file temporaneo, poi copia i file al loro posto;
  - con `/S` NSIS non mostra pagine: esegue solo `.onInit` e le sezioni;
  - in silenzio NSIS crea `Programmi\Bookeeper.lnk` nel menu Start e l'icona sul desktop, entrambi con l'AppUserModelID `org.bookeeper.desktop`. Con `/UPDATE` non ne crea nessuno e lascia quelli che ci sono;
  - in silenzio, un errore di scrittura viene ignorato e NSIS esce comunque con 0;
  - un Bookeeper aperto viene chiuso da NSIS;
  - i downgrade sono permessi.
- **Argomenti:** `/D=<cartella>` e `_?=<cartella>` DEVONO essere gli ultimi, senza virgolette, preceduti da uno spazio. Con `_?=` il disinstallatore lavora sul posto e non si copia altrove.
- **Registro:**
  - `UninstallString` = `"<cartella>\uninstall.exe"`;
  - `InstallLocation` è scritto fra virgolette;
  - la cartella, senza virgolette, sta anche in `HKCU\Software\bookeeper\Bookeeper` (il produttore è `bookeeper`);
  - `QuietUninstallString` non viene scritto.
- **Aggiornamenti dall'app:** il plugin lancia l'installer con `/P /UPDATE /R /ARGS …`. In modalità aggiornamento NSIS non esegue mai `UninstallString`.
- **Pagina di reinstallazione:** nell'installer classico, lanciato a mano, la scelta «disinstalla prima di installare» è già selezionata. Esegue `UninstallString` con `/P` (se passivo) e ` _?=<cartella>`, aspetta, e protesta se il codice non è 0 o se `bookeeper.exe` è ancora lì.
- **Disinstallazione NSIS:** toglie il valore `Bookeeper` da `HKCU\…\Run`. Cancella `%APPDATA%\org.bookeeper.desktop` e `%LOCALAPPDATA%\org.bookeeper.desktop` solo se si spunta una casella, che in silenzio non c'è.
- **Notifiche:** l'app manda le notifiche di Windows con l'ID `org.bookeeper.desktop`. Windows le mostra solo per un ID registrato, e oggi lo registra il collegamento nel menu Start.
- **Dati dell'app:**
  - stanno in `%APPDATA%\org.bookeeper.desktop`: `bookeeper.sqlite`, copertine, backup automatici, `connections.json`, e dalla 10A gli e-book;
  - WebView2 tiene i suoi dati in `%LOCALAPPDATA%\org.bookeeper.desktop`;
  - i token stanno nel portachiavi di sistema, con nomi `<chiave>.org.bookeeper.desktop`.
- **Release:**
  - raccoglie solo `*-setup.exe`, `.dmg`, `.AppImage` e `.deb`;
  - `SHA256SUMS`, i file della release e `bk dist` cercano `Bookeeper_*`;
  - sul Mac la CI salta lo sfondo del DMG e la posizione delle icone, perché GitHub imposta `CI=true`.

## Design

### I pezzi

| Pezzo | Dove | Cosa fa |
|---|---|---|
| Logica del Setup | `crates/bookeeper-setup-core` | Libreria Rust senza Tauri: coda e metadati, stato installato, piani, riga di comando, controllo della cartella, avanzamento, apertura all'accesso, operazioni di sistema su Windows. |
| App del Setup | `apps/setup` (`@bookeeper/setup`), Rust in `apps/setup/src-tauri` (`bookeeper-setup`) | La finestra, i comandi per l'interfaccia, la modalità silenziosa. |
| Gancio NSIS | `apps/desktop/src-tauri/windows/hooks.nsh` | Installa il disinstallatore di marchio e lo registra in Windows. |
| Assemblaggio | `scripts/setup/assemble.mjs` | Accoda installer, metadati e coda al Setup. |
| Citazioni | `scripts/setup/quotes.mjs` | Genera le citazioni del Setup da `docs/citazioni`. |
| App desktop | `apps/desktop` | Apertura all'accesso, una sola istanza, messaggio per una libreria troppo nuova. |
| Sfondo del DMG | `apps/desktop/src-tauri/dmg/` | Immagine 660×400, con la versione @2x. |

- `crates/bookeeper-setup-core` si compila e si prova anche su Linux. Il codice solo-Windows sta dietro `#[cfg(windows)]` e DEVE passare `cargo check --target x86_64-pc-windows-msvc`. Su Linux ci sono implementazioni finte delle stesse funzioni, per i test.
- Le due crate nuove entrano nel workspace con `version.workspace = true`. Il `tauri.conf.json` del Setup non ha `version`: la prende da Cargo.
- Il Setup ha un `build.rs` che crea una cartella `dist` vuota se manca, come l'app: così `cargo clippy --workspace` compila anche su Linux.
- Il Setup ha un suo identificatore, `org.bookeeper.setup`.

### Il file che si scarica

```
Bookeeper-Setup-<v>.exe = bookeeper-setup.exe ‖ installer NSIS ‖ metadati ‖ coda
coda (24 byte) = "BKSETUP1" ‖ lunghezza metadati (u32 LE) ‖ lunghezza installer (u64 LE) ‖ 4 byte a zero
metadati (JSON UTF-8) = {
  "version": "2.2.0",
  "payload": { "name": "Bookeeper_2.2.0_x64-setup.exe", "bytes": …, "sha256": "…" },
  "main": { "name": "bookeeper.exe", "bytes": …, "sha256": "…" },
  "installed_bytes": …
}
```

- **Lettura:**
  - il Setup legge la coda alla fine del proprio eseguibile. Se l'eseguibile ha una firma Authenticode, la coda sta subito prima del blocco della firma;
  - le lunghezze DEVONO stare dentro il file;
  - senza coda, il Setup è il disinstallatore («leggero»), ma solo se è partito con `--uninstall`. Altrimenti mostra «Il file scaricato è incompleto. Scaricalo di nuovo.»
- **Estrazione:**
  - in una cartella nuova con un nome casuale dentro `%TEMP%`, creata in modo esclusivo: se esiste già, errore;
  - il Setup tiene l'installer aperto in sola lettura, impedendo ad altri di scriverlo, mentre ne calcola lo SHA-256 e mentre lo lancia. Se lo SHA-256 non coincide: errore, e NSIS NON parte.
- `installed_bytes` è la somma di `bookeeper.exe` e del Setup leggero. Serve per lo spazio richiesto.

### Sicurezza del Setup

- Il manifest dichiara `asInvoker`.
- Il Setup si collega con `/DEPENDENTLOADFLAG:0x800` e chiama `SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32)` all'avvio: una DLL con un nome di sistema, lasciata accanto al Setup nei Download, non viene caricata. La CI controlla le dipendenze con `dumpbin /dependents`.
- Se parte con i permessi di amministratore, il Setup si ferma: «Apri il Setup senza permessi di amministratore: Bookeeper si installa per il tuo utente.» Così non installa nel profilo dell'amministratore.
- Il Setup legge dal registro solo percorsi assoluti su dischi locali, e li controlla prima di usarli.

### Lo stato installato

1. Il Setup legge la cartella dal valore predefinito di `HKCU\Software\bookeeper\Bookeeper`. Se manca, usa `InstallLocation` della chiave di disinstallazione, senza virgolette.
2. Legge la versione da `DisplayVersion`.
3. Considera l'installazione valida solo se la cartella esiste e contiene `bookeeper.exe`.
4. Una versione sotto la 2.0.0 è la 0.x: «Su questo computer c'è Bookeeper 0.2.1, una versione molto vecchia. Disinstallala da Impostazioni › App, poi riapri il Setup.»

### Installare

1. Senza installazione il Setup mostra il benvenuto:
   - cartella predefinita `%LOCALAPPDATA%\Bookeeper`;
   - icone accese (vedi «Icone e notifiche»);
   - apertura all'accesso spenta.
2. **«Installa»:**
   - controlla che Bookeeper non sia aperto da quella cartella; se lo è, mostra «Chiudi Bookeeper per continuare»;
   - estrae e controlla l'installer;
   - lancia NSIS con una riga di comando scritta a mano (`CommandExt::raw_arg`): `"<installer>" /S /D=<cartella>`. NSIS gira con `TEMP` e `TMP` puntati a una cartella privata, dentro quella dell'estrazione;
   - aspetta la fine, al massimo 10 minuti. Oltre, chiude NSIS e mostra l'errore;
   - controlla che `bookeeper.exe` abbia la dimensione e lo SHA-256 dei metadati. Altrimenti è un errore, anche se NSIS è uscito con 0;
   - toglie i collegamenti non voluti, solo se puntano a `<cartella>\bookeeper.exe`;
   - con l'apertura all'accesso la accende (vedi «Apertura all'accesso»);
   - cancella la cartella temporanea.
3. La schermata finale dice «Bookeeper è pronto» e «Lo trovi sul desktop e nel menu Start.». Senza l'icona sul desktop dice «Lo trovi nel menu Start.».
4. «Apri Bookeeper» avvia `bookeeper.exe` e chiude il Setup.

**L'avanzamento ha quattro passi.**

| Passo | Testo | Barra |
|---|---|---|
| Preparo | «Preparo l'installazione» | 0–8% |
| Copio | «Copio i file» | 8–90% |
| Icone | «Creo le icone» | 90–96% |
| Fine | «Ultimi ritocchi» | 96–100% |

- NSIS scompatta prima tutto in un file temporaneo: `bookeeper.exe` resta a 0 byte e poi si riempie in un attimo. La barra NON DEVE seguire la sua dimensione.
- Durante «Copio», la barra segue la dimensione del file di scompattamento (`ns*.tmp`) nella cartella temporanea privata di NSIS, rispetto alla somma dei file installati.
- Se quel file non si trova, la barra avanza con il tempo, su una stima, rallentando: non arriva mai al 90% prima che `bookeeper.exe` sia completo.
- I traguardi veri fanno avanzare la barra di colpo: `bookeeper.exe` completo vale 90%, la fine di NSIS 96%.
- La barra non torna mai indietro.
- Ogni passo resta visibile almeno 600 ms, e tutta l'installazione almeno 3 secondi: un'installazione di un secondo e mezzo non deve sembrare un lampo.

### Personalizzare

- **Cartella:** si sceglie con la finestra di sistema delle cartelle.
  - Se la cartella scelta non si chiama «Bookeeper» e non è vuota, il Setup aggiunge `\Bookeeper`.
  - Il Setup prova a crearla e a scriverci un file. Se non può, sotto il campo compare «Questa cartella chiede i permessi di amministratore. Scegline una nella tua cartella utente.» Le cartelle create solo per la prova si tolgono subito.
  - Cartelle di rete e dischi di rete collegati NON si accettano: «Scegli una cartella di questo computer.»
  - Sul disco della cartella servono `installed_bytes` più 50 MB; sul disco di `%TEMP%` serve il peso dell'installer. Altrimenti: «Su questo disco c'è troppo poco spazio: restano 12 MB.»
  - Con un errore sotto il campo, «Installa» è disattivato.
  - Sotto il campo, quando è tutto a posto: «Servono 24 MB. Sul disco C: restano 212 GB liberi.»
- **Icone:** vedi «Icone e notifiche».
- **All'accesso:** «Apri Bookeeper all'accesso a Windows». Sotto: «Si apre ridotto a icona. Se condividi la libreria in rete, i telefoni la trovano finché il computer è acceso.»

### Icone e notifiche

Windows mostra le notifiche di Bookeeper (per esempio i prestiti scaduti) solo se l'ID dell'app è registrato. Oggi lo registra la voce nel menu Start. Senza quella voce le notifiche spariscono in silenzio. Senza nessuna delle due icone, l'app resta nascosta in una cartella di sistema.

Il proprietario sceglie una di queste:

- **Voce nel menu Start sempre presente (consigliata).** Il pannello offre solo «Icona sul desktop». Al posto del secondo interruttore c'è una riga fissa: «Bookeeper è sempre nel menu Start: serve alle notifiche di Windows.»
- **Voce nel menu Start facoltativa.**
  - Il Setup registra l'ID in `HKCU\Software\Classes\AppUserModelId\org.bookeeper.desktop`, con nome e icona, e lo toglie quando si disinstalla.
  - Prima della costruzione bisogna provare su Windows che le notifiche arrivino.
  - Con tutte e due le icone spente, sotto compare: «Senza icone, Bookeeper si apre solo dalla cartella in cui lo installi.»

### Aggiornare e riparare

Se Bookeeper 2.x è già installato, il Setup confronta le versioni:

| Installata | Il pannello dice | Comandi |
|---|---|---|
| Più vecchia | «Aggiorna Bookeeper». «Su questo computer c'è la 2.1.0. La 2.2.0 lascia la tua libreria com'è, nella stessa cartella.» | «Disinstalla», «Aggiorna» |
| La stessa | «Bookeeper 2.2.0 è già installato». «Puoi ripararlo, se qualcosa non va, o disinstallarlo.» | «Disinstalla», «Ripara», «Apri Bookeeper» |
| Più nuova | «C'è già una versione più recente». «Su questo computer c'è la 2.3.0. Una libreria della 2.3.0 non si apre con la 2.2.0: per tornare indietro bisogna disinstallare con «Cancella tutto».» | «Disinstalla», «Chiudi» |

- «Aggiorna» e «Ripara» lanciano `"<installer>" /S /UPDATE /D=<cartella installata>`. La cartella e i collegamenti restano come sono.
- Durante un aggiornamento, `bookeeper.exe` è quello vecchio finché NSIS non lo svuota: l'avanzamento lo ignora finché non è stato riscritto.
- Il Setup NON DEVE mai installare una versione più vecchia sopra una più nuova: i dati dell'app migrano solo in avanti.
- Il Setup leggero, senza installer in coda, offre solo «Disinstalla» e «Chiudi».
- Se arriva `--uninstall` mentre il Setup è già aperto su questa schermata, passa alla disinstallazione. Se sta lavorando, lo ignora.

### Disinstallare

`bookeeper-setup.exe --uninstall` è il comando che Windows lancia da «App».

1. **Riga di comando.** Il Setup legge la riga grezza (`GetCommandLineW`), non gli argomenti già divisi. Accetta, dopo `--uninstall`, anche `/P`, `/UPDATE` e un ` _?=<cartella>` finale che può contenere spazi: sono gli argomenti che aggiunge la pagina di reinstallazione di NSIS.
   - Con `/P` o `/UPDATE` disinstalla senza finestra, tenendo la libreria.
   - Con `_?=` usa quella cartella.
2. **Scelta.** Il pannello offre due schede:
   - «Tieni la libreria», già selezionata. «Libri, copertine e backup restano su questo computer. Se reinstalli, li ritrovi.»
   - «Cancella tutto». «Toglie anche la libreria di questo computer: 312 MB, con copertine e backup.»
   - Se c'è la cartella degli e-book, entrambi i testi li nominano: «… con copertine, e-book e backup.»
   - Se `bookeeper.sqlite` non c'è, il testo parla dei dati salvati e dei collegamenti alle librerie su server.
   - Il peso è la somma delle due cartelle dei dati.
3. **«Disinstalla»** è un bottone pieno salvia, non rosso: secondo `DESIGN.md`, il rosso sta solo nella conferma.
   - Con «Tieni la libreria» si procede subito.
   - Con «Cancella tutto» si apre la conferma, fatta con `Dialog tone="danger"` del kit:
     - titolo «Cancellare tutta la libreria?»;
     - testo «Spariscono da questo computer i libri, le copertine e i backup automatici: 312 MB. Non si può annullare.»;
     - nota «Le librerie su un server restano dove sono.»;
     - comandi «Annulla» e «Cancella tutto».
4. **Esecuzione**, tutta nello stesso processo:
   - controlla che Bookeeper non sia aperto;
   - lancia `"<cartella>\uninstall.exe" /S _?=<cartella>` con `raw_arg` e aspetta;
   - controlla che `bookeeper.exe` non ci sia più;
   - cancella `uninstall.exe`, poi sposta il proprio eseguibile fuori dalla cartella con `self_replace::self_delete_outside_path`, e toglie la cartella se è vuota;
   - toglie i valori `Bookeeper` da `Run` e da `Explorer\StartupApproved\Run`.
5. **Con «Cancella tutto»**, in più:
   - cancella dal Gestore credenziali tutte le credenziali il cui nome finisce in `.org.bookeeper.desktop`, anche quelle che `connections.json` non elenca più;
   - cancella `%APPDATA%\org.bookeeper.desktop` e `%LOCALAPPDATA%\org.bookeeper.desktop`;
   - cancella la chiave `HKCU\Software\bookeeper\Bookeeper`, e `HKCU\Software\bookeeper` se resta vuota;
   - con la voce nel menu Start facoltativa, toglie anche la registrazione dell'ID.
6. **Fine.**
   - Con la libreria tenuta: «La tua libreria è ancora su questo computer: se reinstalli Bookeeper, la ritrovi.»
   - Altrimenti: «Su questo computer non restano i tuoi dati di Bookeeper.»
   - «Chiudi» esce con 0.
7. «Annulla» esce con 1: la pagina di reinstallazione di NSIS lo legge come «annullato».

### Il gancio NSIS

`apps/desktop/src-tauri/windows/hooks.nsh`, collegato da `bundle.windows.nsis.installerHooks`:

```nsis
; Defined at the top: inside a macro, __FILEDIR__ would be the folder of installer.nsi.
!define BK_HOOKS_DIR "${__FILEDIR__}"

!macro NSIS_HOOK_POSTINSTALL
  !if /FileExists "${BK_HOOKS_DIR}\bookeeper-setup.exe"
    SetOverwrite try
    File "/oname=$INSTDIR\bookeeper-setup.exe" "${BK_HOOKS_DIR}\bookeeper-setup.exe"
    SetOverwrite on
    WriteRegStr SHCTX "${UNINSTKEY}" "UninstallString" "$\"$INSTDIR\bookeeper-setup.exe$\" --uninstall"
    WriteRegStr SHCTX "${UNINSTKEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
  !endif
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$INSTDIR\bookeeper-setup.exe"
  RMDir "$INSTDIR"
!macroend
```

- Il gancio gira a ogni installazione, anche negli aggiornamenti passivi dall'app: il disinstallatore di marchio resta registrato.
- `bookeeper-setup.exe` accanto al gancio è il Setup leggero. La release ce lo copia prima di costruire l'app; il file non entra nel repository (`.gitignore` esclude già `*.exe`).
- Senza file, l'installer resta quello di oggi: le build di sviluppo non cambiano. Nella release invece la mancanza DEVE fermare tutto: un passo controlla il file prima della build, e la prova di fumo controlla `UninstallString`.
- `QuietUninstallString` lo scrive il gancio, per gli strumenti che disinstallano in silenzio.
- In `tauri.conf.json` `installMode` diventa esplicito: `currentUser`.
- `@tauri-apps/cli` si fissa a una versione esatta: il gancio dipende dal modello NSIS di quella versione.

### Apertura all'accesso

- **Una sola implementazione per Windows**, in `bookeeper-setup-core` (`autostart::{enable, disable, is_enabled}`):
  - `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, valore `Bookeeper` = `"<cartella>\bookeeper.exe" --autostart`;
  - `HKCU\…\Explorer\StartupApproved\Run`, valore `Bookeeper` = «acceso»;
  - è acceso solo se ci sono tutti e due, e il secondo non dice «spento» (come quando lo si spegne da Gestione attività).
- Il Setup la usa durante l'installazione. L'app la usa su Windows; sul Mac e su Linux usa `tauri-plugin-autostart`.
- **Nell'app:**
  - due comandi, `autostart_get` e `autostart_set`, come gli altri comandi dell'app;
  - la finestra principale nasce invisibile. Con `--autostart` si mostra ridotta a icona, altrimenti normale: niente lampo;
  - prima di installare un aggiornamento, l'app scrive un segno nella cartella dei dati. Al riavvio, se c'è il segno, lo toglie e ignora `--autostart`: dopo un aggiornamento l'app si riapre normale, anche se il plugin le ripassa gli argomenti;
  - **una sola istanza** (`tauri-plugin-single-instance`): un secondo avvio mostra la finestra che c'è. Due istanze aprirebbero lo stesso database e litigherebbero sulla porta della condivisione.
- **Impostazioni › Condivisione**, nuovo blocco «All'accesso»: interruttore «Apri Bookeeper all'accesso al computer», nota «Si apre ridotto a icona. Se condividi la libreria, i telefoni la trovano finché il computer è acceso.» Il blocco c'è solo nell'app desktop.

### Libreria più nuova dell'app

Oggi, se il database è di una versione più nuova, l'app si chiude senza dire nulla. Da qui in avanti mostra una finestra di sistema: «Questa libreria è di una versione più recente di Bookeeper. Installa la versione più recente per aprirla.» Poi si chiude.

### Modalità silenziosa

Serve agli amministratori e alle prove automatiche.

```
Bookeeper-Setup-2.2.0.exe --quiet [--dir=<cartella>] [--no-desktop] [--no-start-menu] [--autostart]
bookeeper-setup.exe --uninstall --quiet [--delete-data]
```

- Non avvia Tauri né WebView2, e non usa l'istanza unica.
- Il Setup è un programma con finestra: chi lo lancia DEVE aspettarlo con `Start-Process -Wait -PassThru` in PowerShell, o `start /wait` in cmd.
- Con la stessa versione installata ripara. Con una più vecchia aggiorna, nella sua cartella: un `--dir` diverso è un errore. Con una più nuova esce con 4.

| Codice | Significato |
|---|---|
| 0 | Fatto |
| 1 | Annullato |
| 2 | Errore: il registro del Setup dice quale |
| 3 | Bookeeper è aperto |
| 4 | C'è già una versione più recente, o la 0.x |

Il registro del Setup sta in `%TEMP%\Bookeeper-Setup.log`: passi, comandi lanciati, codici d'uscita, errori. «Copia i dettagli» ne copia le ultime 200 righe.

### Interfaccia

La direzione è nel brief `apps/setup/.impeccable/surfaces/src-main-tsx.md`, con il contratto. Le bozze HTML di `2026-11-27-setup-windows/` sono la composizione che la costruzione DEVE rispettare.

| Stato | Schermata |
|---|---|
| Benvenuto | `01-benvenuto` |
| Personalizza | `02-personalizza` |
| In corso | `03-in-corso` |
| Fatto | `04-fatto` |
| Bookeeper aperto | `05-app-aperta` |
| Errore | `06-errore` |
| Aggiorna (e gli altri casi di manutenzione) | `07-aggiorna` |
| Disinstalla | `08-disinstalla` |
| Conferma rossa | `09-conferma` |
| Disinstallato | `10-disinstallato` |
| Tema scuro | `11-tema-scuro` |
| DMG | `12-dmg-anteprima`, `dmg-sfondo` |

**La finestra:**
- 800×520, senza cornice, non ridimensionabile, al centro dello schermo;
- invisibile finché la prima schermata non è disegnata: niente lampo bianco;
- una sola istanza (`tauri-plugin-single-instance`);
- i dati di WebView2 stanno in una cartella temporanea per ogni avvio. Il Setup cancella quelle rimaste dagli avvii precedenti. NON si usano le variabili `WEBVIEW2_*`: passerebbero all'app;
- la barra del titolo ha l'icona, «Bookeeper», riduci e chiudi, ed è trascinabile;
- durante la copia «Chiudi» è disattivato, con il suggerimento «Aspetta la fine dell'installazione».

**Componenti:**
- quelli di `@bookeeper/ui`: `Button`, `IconButton`, `Icon`, `FillBar`, `Dialog`, `Tooltip`;
- `FillBar` con `tone="ok"`: con `auto` diventerebbe ambra al 75% e rossa al 95%. Riceve un testo per `aria-valuetext`;
- la conferma rossa è `Dialog tone="danger"`, con la sua X di chiusura;
- in `apps/setup`: il frontespizio, il pannello e i suoi contenuti;
- le icone nuove (`folder`, `power`, `chevron-up`) entrano nella mappa del kit.

**Lingua e tema:**
- la lingua segue quella di Windows (italiano o inglese), con i testi nello spazio `setup` di `packages/i18n`;
- il tema segue il sistema, con i token di `tokens.css`.

**Movimento**, solo `transform` e `opacity`, come vuole `DESIGN.md`:
- per «Personalizza» il pannello sale con `translateY` (`--bk-dur-slow` `--bk-ease`): è già alto quanto la versione aperta, e da chiuso sta in parte sotto il bordo della finestra;
- il riassunto e il modulo si scambiano in dissolvenza;
- la citazione passa da grande a compatta con la tecnica FLIP: si misura, si cambia la dimensione, e la differenza si anima con `scale` e `translate`;
- la citazione nuova entra con `bk-rise`;
- con `prefers-reduced-motion` ogni cambio è immediato.

### Citazioni

- `scripts/setup/quotes.mjs` genera `apps/setup/src/quotes.json` da `docs/citazioni/citazioni.json`.
- Prende solo le citazioni che il proprietario ha tenuto, elencate in `docs/citazioni/scelte.json`. Quel file lo esporto io dalla pagina di revisione, prima della build.
- Testo e autore seguono la lingua dell'interfaccia. L'opera si mostra fino alla prima parentesi, nella lingua originale: «Cuore», non «Cuore (chapter …)».
- **Dimensioni**, contando i caratteri nella lingua mostrata:
  - frontespizio pieno: fino a 90 caratteri 33px, fino a 140 26px, fino a 200 22px;
  - frontespizio compatto («Personalizza», disinstallazione): 22px, solo fino a 140 caratteri;
  - oltre i 200 caratteri la citazione resta fuori.
- Il benvenuto usa solo citazioni adatte anche al frontespizio compatto.
- La citazione cambia quando parte l'installazione, poi al massimo ogni 6 secondi. La schermata finale tiene l'ultima.
- Le virgolette basse interne diventano alte: «… “Sto rileggendo…” …».
- Le citazioni non stanno in una regione viva: chi usa un lettore di schermo non le sente ripetere.

### Accessibilità

- La barra ha `role="progressbar"`, con valore e testo del passo.
- Una regione viva educata annuncia il passo nuovo e la fine.
- A ogni cambio di stato il fuoco va al titolo del pannello.
- Nessuna scorciatoia globale per Invio: lo gestiscono i bottoni che hanno il fuoco. Nella conferma rossa il fuoco iniziale NON è su «Cancella tutto».
- Esc chiude la conferma.
- Bersagli di almeno 24×24px; contrasti dai token, già controllati.

### Mac: lo sfondo del DMG

- `bundle.macOS.dmg`:
  - `background`: `dmg/background.png`;
  - finestra 660×400;
  - icona dell'app in (180, 180), Applicazioni in (480, 180).
- **Lo sfondo:**
  - fondo `--bk-chrome`, «Bookeeper» in Lora in alto a sinistra;
  - una freccia sottile in `--bk-accent-text` fra le due icone;
  - una mensola sotto le etichette;
  - «Trascina Bookeeper in Applicazioni · Drag Bookeeper to Applications».
- Le due immagini (660×400 e 1320×800) si generano da `dmg/background.html` e si mettono nel repository.
- **Nella release, sui runner macOS:**
  - `TAURI_BUNDLER_DMG_IGNORE_CI=true`, altrimenti Tauri salta sfondo e posizioni;
  - `tiffutil -cathidpicheck` unisce le due immagini in `background.tiff` per gli schermi Retina;
  - entrambi i rami della build passano la TIFF con `--config`;
  - la build del DMG si riprova una volta se lo script di Finder va in timeout.
- In locale resta la PNG.

### Release e CI

**`release.yml`, job desktop su Windows:**
1. costruisce il Setup leggero (`tauri build --no-bundle`) e lo copia in `apps/desktop/src-tauri/windows/bookeeper-setup.exe`. Se il file manca, il job si ferma;
2. costruisce l'app come oggi, con il gancio;
3. assembla `out/installers/Bookeeper-Setup-<v>.exe` con `scripts/setup/assemble.mjs`;
4. **prova di fumo** su Windows, in modalità silenziosa, in una cartella con uno spazio e una lettera accentata (`C:\Prova Bookeeper\Libreria è`):
   - installa e controlla file, hash di `bookeeper.exe`, registro (`UninstallString` = `"<cartella>\bookeeper-setup.exe" --uninstall`) e collegamenti;
   - disinstalla con `--uninstall /P _?=<cartella>`, come fa la pagina di NSIS: il comando DEVE finire solo a lavoro fatto, con 0, e `bookeeper.exe` non DEVE esserci più;
   - reinstalla, crea dati e credenziali finte, disinstalla tenendo i dati e controlla che restino;
   - reinstalla, disinstalla con `--delete-data` e controlla che non restino né dati né credenziali.

   Se la prova fallisce, la release si ferma prima di pubblicare.
5. Il Setup va fra gli installer, nella release su GitHub e in `SHA256SUMS`. L'installer NSIS resta fra i file degli aggiornamenti e nella release, come installer «classico».

**Il resto:**
- `SHA256SUMS`, `files:` della release, `scripts/bk/commands/dist.mjs` e il README conoscono anche `Bookeeper-Setup-*`.
- **Indice dei download:** per `windows-x86_64` DEVE vincere `Bookeeper-Setup-*.exe`, se c'è. La regola si scrive e si prova, invece di contare sull'ordine alfabetico.
- **`ci.yml`, job Windows:** `cargo clippy` e `cargo test` di `bookeeper-setup-core` e `bookeeper-setup`, e il controllo delle dipendenze DLL.
- **Versioni:** `bk` aggiorna anche `apps/setup/package.json`; il job `check` della release controlla anche la versione del Setup.

### Test

- **Rust su Linux:**
  - coda e metadati, anche con una firma finta in fondo e con lunghezze sbagliate;
  - la riga di comando esatta per NSIS, carattere per carattere, con spazi e lettere accentate;
  - la lettura della riga grezza di `--uninstall`, con `/P`, `/UPDATE` e `_?=` con spazi;
  - confronto delle versioni, 0.x compresa;
  - regole della cartella;
  - modello dell'avanzamento: traguardi, stima, mai indietro, tempi minimi;
  - riga di comando silenziosa;
  - piano di disinstallazione, con un portachiavi finto.
- **Rust su Windows (CI):**
  - registro su una chiave di prova, apertura all'accesso compresa;
  - collegamenti;
  - processi aperti;
  - spazio su disco e dischi di rete.
- **Node:** l'assemblaggio (un Setup finto più un installer finto, poi lettura della coda), le citazioni, l'indice dei download.
- **Interfaccia (Vitest, ponte finto):**
  - ogni stato;
  - la scelta e la conferma rossa, con il fuoco iniziale;
  - la cartella con errore;
  - l'avanzamento che non torna indietro;
  - il fuoco e gli annunci.
- **App:**
  - l'interruttore dell'apertura all'accesso;
  - il segno dopo l'aggiornamento;
  - la seconda istanza;
  - il messaggio per la libreria troppo nuova.
- **Prova di fumo** nella release, sopra.

### Ordine di messa in opera

1. `bookeeper-setup-core`: la logica e le operazioni di Windows, con le prove.
2. `apps/setup`: la finestra e i comandi, poi l'interfaccia, stato per stato.
3. Gancio NSIS, assemblaggio, release e CI.
4. App desktop: apertura all'accesso, una sola istanza, libreria troppo nuova.
5. Sfondo del DMG.
6. Una build di prova con `bk build`, che il proprietario prova sul suo PC prima della release.

## Scelte mie, da controllare

- **Nome del file:** `Bookeeper-Setup-<versione>.exe`. Non differisce dall'installer classico solo per le maiuscole, che su Windows coinciderebbero.
- **Finestra:** 800×520.
- **Cartella predefinita:** `%LOCALAPPDATA%\Bookeeper`, quella di oggi. Chi ha già Bookeeper lo ritrova dov'è.
- **«Ripara»:** reinstalla gli stessi file senza toccare i collegamenti.
- **Apertura all'accesso:** l'app si apre ridotta a icona, perché non ha un'icona nell'area di notifica.
- **Installer classico:** resta nella release su GitHub, per chi lo preferisce. Non è più il link di download.
- **Citazioni:** solo quelle che hai tenuto. Oggi sono 7, e quattro vanno bene anche per il benvenuto.
- **Tempi minimi:** l'installazione dura almeno 3 secondi a schermo, anche quando il disco è più veloce.

## Lasciato al costruttore

- Il nome esatto del file di scompattamento di NSIS nella cartella temporanea privata: se non è affidabile, la barra usa solo la stima e i traguardi.
- Le DLL che il Setup importa davvero (`dumpbin /dependents`), per confermare la protezione.
- Il formato esatto del valore «acceso» in `StartupApproved\Run`.

## Rischi

- **Antivirus:** un eseguibile con dati in coda può insospettire. NSIS fa lo stesso da anni. Se capita, si valuta la firma del codice.
- **WebView2 mancante**, su un Windows 10 mai aggiornato: il Setup non potrebbe disegnare la finestra. Prima di aprirla, il Setup controlla WebView2. Se manca, lancia l'installer NSIS classico, che lo installa da sé; il disinstallatore leggero lancia `uninstall.exe`.
- **SmartScreen:** senza firma, ogni nuovo eseguibile parte senza reputazione. Oggi succede già con l'installer NSIS.
- **Modello NSIS di Tauri:** il gancio e la pagina di reinstallazione dipendono da come è fatto oggi. Per questo la versione della CLI è fissata, e la prova di fumo gira a ogni release.
