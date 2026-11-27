# Bookeeper Setup per Windows e sfondo del DMG — design

Data: 2026-11-27. Stato: bozza, da approvare. Le schermate approvate stanno in `2026-11-27-setup-windows/`, accanto a questo file.

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

## Cosa sarebbe un fallimento anche se funziona

- Il Setup somiglia all'app solo nelle schermate: su Windows mostra un lampo bianco, una barra del titolo di sistema, o testo sfocato al 125% e al 150%.
- Dopo il primo aggiornamento automatico, «Disinstalla» torna a aprire la finestra classica di NSIS.
- «Cancella tutto» lascia i token nel Gestore credenziali di Windows, oppure «Tieni la libreria» perde qualcosa.
- La barra di avanzamento resta ferma a 0% e poi salta a 100%.
- Windows chiede i permessi di amministratore.
- Il link di download per Windows porta ancora all'installer classico.

## Approcci considerati

**Come presentare l'installer.** Tre strade, proposte al proprietario:
- **A, scelta:** una mini-app Tauri con i componenti dell'app, che comanda NSIS in silenzio.
- **B:** NSIS «in un clic» con un'immagine del marchio. Più economica, ma resta una finestra di Windows con un'immagine sopra.
- **C:** la procedura classica di NSIS con le immagini del marchio, come nella 0.1. La meno premium.

**Come il Setup porta con sé l'installer NSIS.**
- Compilarlo dentro con `include_bytes!`: servono due compilazioni, perché lo stesso programma deve stare anche dentro l'installer NSIS, come disinstallatore.
- **Scelta: accodarlo all'eseguibile.** Si compila il Setup una volta sola. Il file che si scarica è il Setup, seguito dall'installer NSIS, dai metadati e da una coda di 24 byte. Lo stesso Setup senza nulla in coda è il disinstallatore che NSIS installa. È la tecnica degli archivi autoestraenti: NSIS stesso la usa.

**Come rispettare le scelte delle icone.**
- Passare `/NS` a NSIS e creare noi i collegamenti: bisognerebbe rifare l'AppUserModelID che NSIS imposta sui collegamenti.
- **Scelta: lasciare che NSIS crei entrambi i collegamenti, poi togliere quelli non voluti.** Negli aggiornamenti NSIS non ricrea i collegamenti, quindi la scelta resta.

## Com'è oggi

- `tauri.conf.json` dell'app non ha impostazioni per NSIS: `installMode` vale `currentUser`. L'app si installa in `%LOCALAPPDATA%\Bookeeper` senza permessi di amministratore.
- L'installer NSIS accetta `/S` (silenzioso), `/P` (passivo), `/NS` (nessun collegamento), `/UPDATE` (aggiornamento) e `/D=<cartella>`.
- In silenzio, NSIS crea la voce nel menu Start e l'icona sul desktop, e scrive `UninstallString` = `"<cartella>\uninstall.exe"`.
- Il plugin degli aggiornamenti scarica l'installer NSIS e lo lancia con `/P /UPDATE`. In questo modo NSIS non esegue il vecchio disinstallatore e non tocca i collegamenti.
- Il disinstallatore NSIS toglie il valore `Bookeeper` da `HKCU\…\Run`. Cancella `%APPDATA%\org.bookeeper.desktop` e `%LOCALAPPDATA%\org.bookeeper.desktop` solo se si spunta una casella, che in silenzio non c'è.
- I dati dell'app stanno in `%APPDATA%\org.bookeeper.desktop`: `bookeeper.sqlite`, copertine, backup automatici, `connections.json`. I token delle connessioni stanno nel portachiavi di sistema, servizio `org.bookeeper.desktop`, chiavi `<id>/access` e `<id>/refresh`.
- La release costruisce l'installer NSIS su `windows-latest` e lo mette fra gli installer e fra i file degli aggiornamenti. L'indice dei download (`downloads/<canale>.json`) prende il primo `.exe` per `windows-x86_64`.

## Design

### I pezzi

| Pezzo | Dove | Cosa fa |
|---|---|---|
| Logica del Setup | `crates/bookeeper-setup-core` | Libreria Rust senza Tauri: coda e metadati, piani d'installazione, controllo della cartella, avanzamento, riga di comando, operazioni di sistema su Windows. |
| App del Setup | `apps/setup` (`@bookeeper/setup`), Rust in `apps/setup/src-tauri` (`bookeeper-setup`) | La finestra, i comandi per l'interfaccia, la modalità silenziosa. |
| Gancio NSIS | `apps/desktop/src-tauri/windows/hooks.nsh` | Installa il disinstallatore di marchio e lo registra in Windows. |
| Assemblaggio | `scripts/setup/assemble.mjs` | Accoda installer, metadati e coda al Setup. |
| Citazioni | `scripts/setup/quotes.mjs` | Genera le citazioni del Setup da `docs/citazioni`. |
| Apertura all'accesso | app desktop | Plugin `tauri-plugin-autostart`, scelta nelle Impostazioni. |
| Sfondo del DMG | `apps/desktop/src-tauri/dmg/` | Immagine 660×400, con la versione @2x. |

`crates/bookeeper-setup-core` si compila e si prova anche su Linux. Il codice solo-Windows sta dietro `#[cfg(windows)]` e DEVE passare `cargo check --target x86_64-pc-windows-msvc`. Su Linux ci sono implementazioni finte delle stesse funzioni, per i test.

### Il file che si scarica

```
Bookeeper-Setup-<v>.exe = bookeeper-setup.exe ‖ installer NSIS ‖ metadati ‖ coda
coda (24 byte) = "BKSETUP1" ‖ lunghezza metadati (u32 LE) ‖ lunghezza installer (u64 LE) ‖ 4 byte a zero
metadati (JSON UTF-8) = {
  "version": "2.2.0",
  "payload": { "name": "Bookeeper_2.2.0_x64-setup.exe", "bytes": …, "sha256": "…" },
  "main": { "name": "bookeeper.exe", "bytes": … },
  "installed_bytes": …
}
```

- All'avvio il Setup legge gli ultimi 24 byte del proprio eseguibile. Senza `BKSETUP1` è il disinstallatore (modalità «leggera»).
- L'installer si estrae in una cartella temporanea propria, e se ne controlla lo SHA-256. Se non coincide: errore, e NSIS NON parte.
- `installed_bytes` è la somma di `bookeeper.exe` e del Setup leggero. Serve per lo spazio richiesto.

### Installare

1. Il Setup legge lo stato da `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\Bookeeper`: `DisplayVersion` e `InstallLocation`.
2. Senza installazione mostra il benvenuto: cartella predefinita `%LOCALAPPDATA%\Bookeeper`, icona sul desktop e voce nel menu Start accese, apertura all'accesso spenta.
3. «Installa»:
   - controlla che Bookeeper non sia aperto da quella cartella; se lo è, mostra «Chiudi Bookeeper per continuare»;
   - estrae e controlla l'installer;
   - lancia `"<installer>" /S /D=<cartella>`. `/D=` DEVE essere l'ultimo argomento, senza virgolette, come vuole NSIS;
   - durante la copia, ogni 100 ms legge la dimensione di `<cartella>\bookeeper.exe` e la confronta con `main.bytes`;
   - aspetta la fine. Codice diverso da 0, o nessun `bookeeper.exe`: errore;
   - toglie i collegamenti non voluti: `Bookeeper.lnk` nel desktop dell'utente (`FOLDERID_Desktop`) e nei Programmi del menu Start (`FOLDERID_Programs`);
   - con l'apertura all'accesso scrive `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, valore `Bookeeper` = `"<cartella>\bookeeper.exe" --autostart`;
   - cancella la cartella temporanea.
4. «Apri Bookeeper» avvia `bookeeper.exe` e chiude il Setup.

**L'avanzamento ha quattro passi, ciascuno con il suo tratto della barra:**

| Passo | Testo | Barra |
|---|---|---|
| Preparo | «Preparo l'installazione» | 0–8% |
| Copio | «Copio i file · 14 di 24 MB» | 8–90%, dalla dimensione di `bookeeper.exe` |
| Icone | «Creo le icone» | 90–96% |
| Fine | «Ultimi ritocchi» | 96–100% |

La barra non torna mai indietro. Se NSIS non finisce entro 10 minuti, è un errore.

### Personalizzare

- **Cartella:** si sceglie con la finestra di sistema delle cartelle.
  - Se la cartella scelta non si chiama «Bookeeper» e non è vuota, il Setup aggiunge `\Bookeeper`.
  - Il Setup prova a crearla e a scriverci un file. Se non può, sotto il campo compare «Questa cartella chiede i permessi di amministratore. Scegline una nella tua cartella utente.»
  - Le cartelle di rete (`\\…`) NON si accettano: «Scegli una cartella di questo computer.»
  - Lo spazio libero DEVE superare `installed_bytes` di almeno 50 MB. Altrimenti: «Su questo disco restano 12 MB: ne servono 74.»
  - Con un errore sotto il campo, «Installa» è disattivato.
- **Icone:** «Icona sul desktop» e «Voce nel menu Start», due interruttori.
- **All'accesso:** «Apri Bookeeper all'accesso a Windows». Sotto: «Si apre ridotto a icona. Se condividi la libreria in rete, i telefoni la trovano sempre.»

### Aggiornare e riparare

Se Bookeeper è già installato, il Setup confronta le versioni:

| Installata | Il pannello dice | Comandi |
|---|---|---|
| Più vecchia | «Aggiorna Bookeeper». «Su questo computer c'è la 2.1.0. La 2.2.0 lascia la tua libreria com'è, nella stessa cartella.» | «Disinstalla», «Aggiorna» |
| La stessa | «Bookeeper 2.2.0 è già installato». «Puoi ripararlo, se qualcosa non va, o disinstallarlo.» | «Disinstalla», «Ripara», «Apri Bookeeper» |
| Più nuova | «C'è già una versione più recente». «Su questo computer c'è la 2.3.0. Per tornare indietro, prima disinstalla.» | «Disinstalla», «Chiudi» |

- «Aggiorna» e «Ripara» lanciano `"<installer>" /S /UPDATE /D=<cartella installata>`. La cartella e i collegamenti restano come sono.
- Il Setup NON DEVE mai installare una versione più vecchia sopra una più nuova: i dati dell'app migrano solo in avanti.
- Il Setup leggero, senza installer in coda, offre solo «Disinstalla» e «Chiudi».

### Disinstallare

`bookeeper-setup.exe --uninstall` è il comando che Windows lancia da «App».

1. **Trasloco.** Un programma non può cancellare il proprio eseguibile mentre gira. Se gira dalla cartella di Bookeeper, il Setup si copia in `%TEMP%\bookeeper-uninstall-<pid>\`, si rilancia da lì con `--uninstall --dir=<cartella>` ed esce.
2. **Scelta.** Il pannello offre due schede:
   - «Tieni la libreria», già selezionata. «Libri, copertine e backup restano su questo computer. Se reinstalli, li ritrovi.»
   - «Cancella tutto». «Toglie anche la libreria di questo computer: 312 MB, con copertine e backup.» Se `bookeeper.sqlite` non c'è, il testo parla dei dati salvati e dei collegamenti alle librerie su server.
   - Il peso è la somma delle due cartelle dei dati.
3. **«Disinstalla»** è un bottone pieno salvia, non rosso: secondo `DESIGN.md`, il rosso sta solo nella conferma.
   - Con «Tieni la libreria» si procede subito.
   - Con «Cancella tutto» si apre `ConfirmDialog` con `tone="danger"`: «Cancellare tutta la libreria?». «Spariscono da questo computer i libri, le copertine e i backup automatici: 312 MB. Non si può annullare.» «Le librerie su un server restano dove sono.» Comandi «Annulla» e «Cancella tutto».
4. **Esecuzione.**
   - Controlla che Bookeeper non sia aperto.
   - Lancia `"<cartella>\uninstall.exe" /S _?=<cartella>` e aspetta. Con `_?=` NSIS lavora sul posto e non si cancella da solo: dopo, il Setup cancella `uninstall.exe` e la cartella, se è vuota.
   - Con «Cancella tutto»:
     - legge `connections.json` e cancella dal portachiavi `<id>/access`, `<id>/refresh` e le chiavi in `stale_secrets`;
     - poi cancella `%APPDATA%\org.bookeeper.desktop`, `%LOCALAPPDATA%\org.bookeeper.desktop` e la chiave `HKCU\Software\<produttore>\Bookeeper`.
5. **Fine.**
   - Con la libreria tenuta: «La tua libreria è ancora su questo computer: se reinstalli Bookeeper, la ritrovi.»
   - Altrimenti: «Su questo computer non resta niente di Bookeeper.»
   - «Chiudi» fa partire un comando che, dopo due secondi, cancella la copia in `%TEMP%`.
6. «Annulla» chiude il Setup con codice 1, che NSIS legge come «annullato» se il disinstallatore parte dalla sua pagina di reinstallazione.

### Il gancio NSIS

`apps/desktop/src-tauri/windows/hooks.nsh`, collegato da `bundle.windows.nsis.installerHooks`:

```nsis
!macro NSIS_HOOK_POSTINSTALL
  !if /FileExists "${__FILEDIR__}\bookeeper-setup.exe"
    SetOverwrite try
    File "/oname=$INSTDIR\bookeeper-setup.exe" "${__FILEDIR__}\bookeeper-setup.exe"
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
- `bookeeper-setup.exe` accanto al gancio è il Setup leggero. La release ce lo copia prima di costruire l'app, e NON si mette nel repository. Senza file, l'installer resta quello di oggi: le build di sviluppo non cambiano.
- `QuietUninstallString` resta quello di NSIS, per gli strumenti che disinstallano in silenzio.
- In `tauri.conf.json` `installMode` diventa esplicito: `currentUser`.

### Apertura all'accesso, nell'app

- `tauri-plugin-autostart` con `MacosLauncher::LaunchAgent` e l'argomento `--autostart`.
- Due comandi, `autostart_get` e `autostart_set`, come gli altri comandi dell'app: l'interfaccia non usa i permessi JavaScript del plugin.
- Avviata con `--autostart`, l'app si riduce subito a icona.
- **Impostazioni › Condivisione**, nuovo blocco «All'accesso»: interruttore «Apri Bookeeper all'accesso al computer», nota «Si apre ridotto a icona. Se condividi la libreria, i telefoni la trovano sempre.» Il blocco c'è solo nell'app desktop.
- Il Setup scrive lo stesso valore di registro che usa il plugin, con lo stesso nome: l'interruttore nell'app lo vede acceso.

### Modalità silenziosa

Serve agli amministratori e alle prove automatiche. Non apre finestre.

```
Bookeeper-Setup-2.2.0.exe --quiet [--dir=<cartella>] [--no-desktop] [--no-start-menu] [--autostart]
bookeeper-setup.exe --uninstall --quiet [--delete-data]
```

| Codice | Significato |
|---|---|
| 0 | Fatto |
| 1 | Annullato |
| 2 | Errore: il registro del Setup dice quale |
| 3 | Bookeeper è aperto |
| 4 | C'è già una versione più recente |

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
- la barra del titolo ha l'icona, «Bookeeper», riduci e chiudi, ed è trascinabile;
- durante la copia «Chiudi» è disattivato, con il suggerimento «Aspetta la fine dell'installazione».

**Componenti:**
- quelli di `@bookeeper/ui`: `Button`, `IconButton`, `Icon`, `FillBar`, `ConfirmDialog`, `Tooltip`;
- in `apps/setup`: il frontespizio, il pannello e i suoi contenuti;
- le icone nuove (`folder`, `power`) entrano nella mappa del kit.

**Lingua e tema:**
- la lingua segue quella di Windows (italiano o inglese), con i testi nello spazio `setup` di `packages/i18n`;
- il tema segue il sistema, con i token di `tokens.css`.

**Movimento:**
- il pannello cresce verso l'alto per «Personalizza» (altezza animata, `--bk-dur-slow` `--bk-ease`) e la citazione si compatta;
- a ogni passo la citazione cambia con `bk-rise`;
- con `prefers-reduced-motion` ogni cambio è immediato.

### Citazioni

- `scripts/setup/quotes.mjs` genera `apps/setup/src/quotes.json` da `docs/citazioni/citazioni.json`.
- Prende solo le citazioni che il proprietario ha tenuto, elencate in `docs/citazioni/scelte.json`. Quel file lo esporto io dalla pagina di revisione.
- **Dimensioni:**
  - fino a 70 caratteri: 33px;
  - fino a 130: 26px;
  - fino a 200: 22px;
  - oltre i 200 la citazione resta fuori.
- Nel benvenuto e in «Personalizza» compaiono solo citazioni fino a 130 caratteri: devono restare leggibili anche compatte.
- Le virgolette basse interne diventano alte: «… “Sto rileggendo…” …».
- Testo, autore e opera seguono la lingua dell'interfaccia.
- Le citazioni non stanno in una regione viva: chi usa un lettore di schermo non le sente ripetere.

### Accessibilità

- La barra ha `role="progressbar"`, con valore e testo del passo.
- Una regione viva educata annuncia il passo nuovo e la fine.
- A ogni cambio di stato il fuoco va al titolo del pannello.
- Invio attiva il comando principale; Esc chiude la conferma.
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
- Nella release, sul runner macOS, `tiffutil -cathidpicheck` le unisce in `background.tiff` per gli schermi Retina, e la build la usa con `--config`. In locale resta la PNG.

### Release e CI

**`release.yml`, job desktop su Windows:**
1. costruisce il Setup leggero (`tauri build --no-bundle`) e lo copia in `apps/desktop/src-tauri/windows/bookeeper-setup.exe`;
2. costruisce l'app come oggi, con il gancio;
3. assembla `Bookeeper-Setup-<v>.exe` con `scripts/setup/assemble.mjs`;
4. **prova di fumo** su Windows, in modalità silenziosa:
   - installa in una cartella temporanea e controlla file, registro e collegamenti;
   - disinstalla tenendo i dati e controlla che i dati restino;
   - reinstalla, disinstalla con `--delete-data` e controlla che non resti niente.

   Se la prova fallisce, la release si ferma prima di pubblicare.
5. Il Setup va fra gli installer e nella release su GitHub. L'installer NSIS resta fra i file degli aggiornamenti e nella release, come installer «classico».

**Indice dei download:** per `windows-x86_64` DEVE vincere `Bookeeper-Setup-*.exe`, se c'è.

**`ci.yml`, job Windows:** `cargo clippy` e `cargo test` di `bookeeper-setup-core` e `bookeeper-setup`.

**Versioni:** `bk` aggiorna anche `apps/setup/package.json` e `apps/setup/src-tauri/tauri.conf.json`.

### Test

- **Rust su Linux:**
  - coda e metadati;
  - argomenti per NSIS, con `/D=` ultimo;
  - confronto delle versioni;
  - regole della cartella;
  - modello dell'avanzamento;
  - riga di comando silenziosa;
  - piano di disinstallazione, con un portachiavi finto.
- **Rust su Windows (CI):**
  - registro su una chiave di prova;
  - collegamenti;
  - processi aperti;
  - spazio su disco.
- **Node:** l'assemblaggio (un Setup finto più un installer finto, poi lettura della coda), le citazioni, l'indice dei download.
- **Interfaccia (Vitest, ponte finto):**
  - ogni stato;
  - la scelta e la conferma rossa;
  - la cartella con errore;
  - l'avanzamento che non torna indietro;
  - il fuoco e gli annunci.
- **App:** l'interruttore dell'apertura all'accesso.
- **Prova di fumo** nella release, sopra.

### Ordine di messa in opera

1. `bookeeper-setup-core`: la logica e le operazioni di Windows, con le prove.
2. `apps/setup`: la finestra e i comandi, poi l'interfaccia, stato per stato.
3. Gancio NSIS, assemblaggio, release e CI.
4. Apertura all'accesso nell'app.
5. Sfondo del DMG.
6. Una build di prova con `bk build`, che il proprietario prova sul suo PC prima della release.

## Scelte mie, da controllare

- **Nome del file:** `Bookeeper-Setup-<versione>.exe`.
- **Finestra:** 800×520.
- **Cartella predefinita:** `%LOCALAPPDATA%\Bookeeper`, quella di oggi. Chi ha già Bookeeper lo ritrova dov'è.
- **«Ripara»:** reinstalla gli stessi file senza toccare i collegamenti.
- **Apertura all'accesso:** l'app si apre ridotta a icona, perché non ha un'icona nell'area di notifica.
- **Installer classico:** resta nella release su GitHub, per chi lo preferisce. Non è più il link di download.
- **Citazioni:** solo quelle che hai tenuto, fino a 200 caratteri.

## Lasciato al costruttore

- Verificare su Windows che `${__FILEDIR__}` nel gancio sia la cartella di `hooks.nsh`. Altrimenti si passa il percorso in un altro modo, e la prova di fumo lo DEVE dimostrare.
- Verificare il nome del produttore nella chiave `HKCU\Software\<produttore>\Bookeeper`.
- Verificare il formato esatto che `tauri-plugin-autostart` scrive in `Run`, e scrivere lo stesso dal Setup.
- La cartella del collegamento nel menu Start, se Tauri ne usa una.

## Rischi

- **Antivirus:** un eseguibile con dati in coda può insospettire. NSIS fa lo stesso da anni. Se capita, si valuta la firma del codice.
- **WebView2 mancante**, su un Windows 10 mai aggiornato: il Setup non potrebbe disegnare la finestra. Prima di aprirla, il Setup controlla WebView2. Se manca, lancia l'installer NSIS classico, che lo installa da sé.
- **SmartScreen:** senza firma, ogni nuovo eseguibile parte senza reputazione. Oggi succede già con l'installer NSIS.
