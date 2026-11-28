# Changelog

Tutte le modifiche significative a Bookeeper 2.0 (app desktop, server e
PWA) sono documentate qui. Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/)
e il versioning aderisce a [Semantic Versioning](https://semver.org/lang/it/).

L'auto-updater dell'app legge la sezione corrispondente alla versione
pubblicata e la mostra nella dialog "Vedi novità". Sono supportati:

- heading `##`/`###`
- liste `-`/`*` e numerate
- enfasi `**bold**` / `*italic*`
- inline code `` ` ``
- link `[text](https://...)`


## [2.3.0] - 2026-11-28

### Added

- **Il lettore di e-book**: un EPUB della libreria si legge dentro l'app, sul
  computer e sul telefono. Si apre da «Leggi» nella scheda del libro e dalla
  fila «In lettura». Mentre leggi restano solo la pagina e una linea sottile;
  un tocco riporta le barre. Pagine o scorrimento, due pagine affiancate
  quando c'è spazio.
- **Aspetto della pagina**: temi chiaro, seppia, scuro e nero, oppure «Auto»
  come l'app; il carattere dell'editore o Lora, Inter, serif e sans;
  dimensione, interlinea, margini, giustificazione, sillabazione e stili
  dell'editore. Le regolazioni valgono per tutti i libri su quel dispositivo.
- **Orientarsi nel libro**: indice, barra di avanzamento con le tacche dei
  capitoli, percentuale e tempo che manca alla fine del capitolo e del libro,
  ricerca nel libro. Dopo ogni salto, «Torna al …» riporta dov'eri.
- **Note**: segnalibri ed evidenziazioni in quattro colori, con una nota se
  vuoi. Si ritrovano nel pannello del libro e si esportano in Markdown.
- **Su tutti i dispositivi**: posizione, segnalibri e note passano da un
  dispositivo all'altro. Se un altro dispositivo è più avanti, il lettore
  chiede «Continua da dove eri sul telefono?» e non salta mai da solo.
- **Leggere senza rete sul telefono**: «Scarica per leggere offline» tiene il
  libro sul telefono. Su iPhone l'app spiega come aggiungerla alla schermata
  Home, dove i libri scaricati restano.

### Changed

- **Libri letti**: all'ultima pagina il lettore chiede se segnare il libro
  come letto.
- **Backup**: l'archivio contiene anche le note e le posizioni di lettura.
- **«In lettura»**: l'anello sulle copertine si vede anche allo 0%, e
  «Vedi tutti» compare solo quando la fila non mostra già tutti i libri.


## [2.2.0] - 2026-11-28

### Added

- **E-book nella libreria**: a ogni libro puoi attaccare i suoi file EPUB,
  PDF, MOBI, AZW3, FB2 o CBZ, e scaricarli da tutti i dispositivi collegati.
  Trascina degli e-book sulla pagina dei libri e diventano libri, con titolo,
  autori e copertina letti dal file; se il libro c'è già, il file gli si
  attacca. Sulle copertine un'etichetta dice il formato.
- **Il Setup di Bookeeper per Windows**: un'installazione nello stile
  dell'app, con le scelte a portata di mano (cartella, icona sul desktop, avvio
  con Windows). Aggiorna una versione già installata e
  disinstalla chiedendo se tenere i dati, già scelto «tenere».
- **La pagina d'apertura**: a ogni apertura una citazione di uno scrittore
  sulla lettura, in italiano o in inglese come l'app. «Come vuoi iniziare?»
  compare solo la prima volta; chi torna trova subito «Bentornato».

### Changed

- **Backup**: l'archivio elenca gli e-book ma non li contiene. Per
  conservarli copia la cartella «ebooks» dei dati.
- **Registro attività**: registra anche i file aggiunti e tolti.

### Fixed

- Nelle finestre strette la scheda del libro mette la colonna di destra sotto
  e non schiaccia più il titolo.

## [2.1.0] - 2026-11-27

### Added

- **Tutorial al primo accesso**: ogni persona nuova trova un percorso breve,
  fatto sui suoi dati. In una libreria vuota ti accompagna ad aggiungere un
  libro che hai vicino, a dargli un posto sullo scaffale e a portare la
  libreria sul telefono. Se entri in una libreria già piena, ti mostra come
  trovare un libro, dove si trova e come segnare cosa leggi. Si salta con un
  clic, si riprende da «Primi passi» e si rivede dalle Impostazioni.
- **Pop-up del libro**: «Nuovo libro» e «Modifica libro» si aprono al centro
  dello schermo e crescono man mano che compili.

### Changed

- **Eliminare è più tranquillo**: i comandi per eliminare restano al loro
  posto, neutri. Il rosso compare solo nella conferma, che dice cosa
  succede. La zona pericolosa fissa resta solo nelle Impostazioni e
  nell'Account del telefono.
- **Impostazioni a tutto schermo**: sugli schermi larghi le schede si
  affiancano, e il registro attività usa tutta la larghezza.
- Il suggerimento della libreria vuota si chiama «Popola la tua libreria».

### Fixed

- I menu a tendina dentro i pop-up, come la stanza di un mobile o la persona
  di un prestito, si aprono di nuovo.
- Con un server dietro un proxy HTTPS, «Informazioni» mostra «Cifrata da un
  proxy» invece di «Rete locale, senza cifratura».
- Nella scheda del libro, il libro 3D mostra intera la copertina caricata, e
  il dorso riprende l'immagine.

## [2.0.0] - 2026-11-26

Bookeeper 2.0 è una versione nuova, riscritta. Non importa i dati della 0.x:
si parte da una libreria nuova (da Goodreads, Calibre o LibraryThing si può
importare).

### Added

- **Tre parti**: app desktop con la libreria sul tuo computer, server
  autonomo (binario o Docker) e PWA sul telefono. Le guide sono in
  `docs/deploy.md`.
- **Server in rete**: tre modalità TLS (`off` dietro un proxy, `acme` con
  dominio, `self` per la rete di casa), configurabile con variabili
  `BOOKEEPER_*`, codice di setup, controllo di salute per Docker.
- **Dispositivi e persone**: abbinamento con codice o QR, revoca,
  ruoli (proprietario, admin, membro, ospite), inviti e registro attività.
- **Lettura e organizzazione**: stato di lettura per persona con date,
  valutazione e nota; tag colorati; stanze; filtri avanzati; statistiche di
  lettura e «Il tuo anno in libri».
- **Scaffale fisico**: «Dov'è?» da ricerca, palette e scheda libro;
  trascinamento dei libri anche da tastiera; dorso dal colore della
  copertina; scan-a-scaffale dal telefono.
- **Famiglia e mobile**: prestiti anche a membri, storico dei prestiti,
  wishlist di famiglia, promemoria dei prestiti scaduti sul desktop. La PWA
  cerca, scansiona, modifica i campi base, gestisce prestiti e wishlist e
  avvisa offline se hai già un libro.
- **Palette comandi** (`Ctrl+K`).
- **Backup programmato** con rotazione, backup a mano e ripristino
  riservato al proprietario.
- **Tutto ciò che c'era nella 0.3**: libri con ricerca, griglia e tabella,
  lookup ISBN, scaffali, prestiti, wishlist, statistiche, import
  (Goodreads, Calibre, LibraryThing), export JSON/CSV, etichette PDF,
  italiano e inglese, aggiornamenti con note di versione, tema chiaro,
  scuro o di sistema.
- **Libreria grande**: elenchi e ricerca restano fluidi con 10.000 libri,
  sul desktop e sul telefono.
- **Contrasto e tema scuro**: colori rivisti in entrambi i temi per
  rispettare i contrasti di leggibilità, anche sul telefono.

### Changed

- Il core è scritto in Rust e l'app desktop usa Tauri.
- L'accesso usa un token per dispositivo su HTTPS. La password
  amministratore e il certificato condiviso (mTLS) non esistono più.
- Il telefono si collega solo a un server con HTTPS valido.

### Removed

- Compatibilità con i dati e con l'API della 0.x.
- Il vecchio server, i vecchi client, i file di distribuzione e il sito
  della 0.3: restano solo le tre parti della 2.0.

## [0.2.1]

### Added

- **Importa la tua libreria da Goodreads, Calibre o LibraryThing**: nuovo tab
  Impostazioni → Dati. Scegli il file CSV/TSV esportato dal servizio,
  Bookeeper mostra un'anteprima (nuovi, duplicati per ISBN, errori) e importa
  solo dopo conferma. Riconoscimento automatico del formato.
- **Esporta la libreria** in JSON (backup completo) o CSV (fogli di calcolo),
  con salvataggio tramite dialog nativo.
- **Backup & Ripristino** (Impostazioni → Dati): backup completo della
  libreria in un file JSON (libri, scaffali, prestiti, wishlist). In modalità
  locale il backup è anche automatico: ogni 3 giorni all'avvio, con rotazione
  degli ultimi 5. Il ripristino è protetto dalla password amministratore e da
  doppia conferma (va ricopiato il nome della libreria); al termine l'app si
  ricarica con i dati del backup.

- **Bookeeper ora parla anche inglese**: nuova impostazione Lingua
  (Impostazioni → Account) con Italiano / English / Sistema ("Sistema"
  segue la lingua del computer). Si applica subito, senza riavvio.
  Tradotta l'intera app: navigazione, login, libri, scaffali, prestiti,
  wishlist, statistiche, dispositivi/abbinamento mobile, impostazioni
  e le notifiche di aggiornamento.

- **Primo avvio guidato**: la vista Libri vuota accompagna all'aggiunta del
  primo libro (col codice a barre sul retro fa tutto Bookeeper), con
  scorciatoia per chi ha già un catalogo da importare. Alla prima aggiunta,
  una piccola celebrazione suggerisce i prossimi passi (scaffale, import).
  Suggerimenti contestuali one-shot su Scaffali e Prestiti, chiudibili e
  che non tornano più.

### Fixed

- **Libreria locale: il retry della creazione non duplica più la libreria**:
  se il primo tentativo si interrompeva a metà (o si rifaceva il setup dopo
  una disconnessione totale), un nuovo "Crea la libreria" creava un secondo
  tenant vuoto nello stesso database e i libri sembravano spariti. Ora l'app
  ricorda la libreria locale creata e vi ri-associa il dispositivo.
- **Libreria locale: app aperta due volte**: la seconda istanza ora riusa il
  server locale della prima invece di fallire con "porta occupata".
- **Abbinamento mobile in modalità locale**: la pagina spiega chiaramente che
  il telefono non può raggiungere una libreria che vive su 127.0.0.1, invece
  di mostrare un QR che non avrebbe mai funzionato. Nascosto anche il
  pannello "Diagnostica mTLS" (solo per deploy remoti con Caddy).

## [0.2.0]

- restyle login, client-side hosting
- refactoring backend stage 1

## [0.1.22]

### Changed

- **Restyle completo dell'interfaccia ("biblioteca moderna")**: palette e
  funzioni invariate, nuovo sistema visivo condiviso (token per superfici,
  ombre calde, motion 150–280ms ease-out, dark mode centralizzato).
  - **Scaffali ridisegnati**: ora sono mobili veri — cornice in legno
    colorato, fondale in ombra, mensole con spessore, dorsi con altezze
    variabili che poggiano sulla mensola; al passaggio del mouse il libro
    "si sfila" dallo scaffale. Ingresso animato dei dorsi a cascata.
  - **Copertine da libro fisico**: piega del dorso e ombra da volume anche
    sulle copertine scaricate; i segnaposto usano tinte tela-libro della
    palette (non più colori casuali). In griglia, all'hover la copertina si
    solleva.
  - **Statistiche**: numeri che contano da zero all'apertura, schede KPI in
    stile editoriale, barre fluide senza scatti.
  - Sidebar su fondo caldo distinto dal contenuto, voce attiva a "pillola",
    transizioni di pagina e micro-feedback sui pulsanti ovunque.
  - Stati di prestiti/wishlist espressi con bordi e velature (via le
    barrette laterali colorate); tutte le animazioni rispettano
    "riduci movimento" di sistema.
- **Schermata di accesso a percorsi guidati**: prima scegli cosa vuoi fare
  (Crea la libreria qui / Crea su un server / Unisciti a una libreria /
  Bentornato), poi vedi SOLO i campi di quel percorso, con spiegazioni
  sotto ogni campo e senza gergo tecnico. Il passaggio tra le schermate è
  un morphing fluido (View Transitions, con fallback automatico); alla
  riuscita il pulsante si trasforma in conferma verde prima di entrare.
  Le opzioni avanzate (rete privata/Tailscale) restano ripiegate finché
  non servono; gli errori di campo si spengono mentre correggi.

## [0.1.21] - 2026-05-03

- **self hosting**: Al primo avvio l'app ora apre direttamente "Crea la tua libreria" con la scelta Questo computer / Server remoto. Scegliendo "Questo computer" bastano nome libreria, nome, email e password: un click e la sessione è attiva. Zero Docker, zero Caddy, zero configurazione.

### Added

- **Libreria locale (self-hosting embedded)**: al primo avvio l'app
  propone "Crea la tua libreria" con scelta **Questo computer** /
  **Server remoto**. In locale il server Bookeeper completo gira dentro
  l'app (127.0.0.1, dati in `%APPDATA%/Bookeeper/local-server`): niente
  Docker, Caddy o configurazione — nome libreria, nome, email, password
  e un click. La admin password del tenant viene generata e custodita
  dall'app (precompilata automaticamente dove serve, es. rigenerazione
  invite code nelle Impostazioni).
- **Creazione tenant one-click anche su server remoto**: il pairing del
  dispositivo parte automaticamente dopo la creazione del tenant, senza
  il secondo passaggio manuale con l'invite code (che resta consultabile
  in Impostazioni → Tenant). Se il pairing automatico fallisce, il form
  di associazione appare già precompilato.

## [0.1.19] - 2026-05-03

### Fixed

- **Pulsante "ricarica copertina" che non sbloccava i libri "non
  trovati"**: il server tiene una cache negativa di 24h per i lookup
  ISBN che falliscono (per non martellare i provider). Quando un
  fallimento transiente di Anna's Archive / Google Books / OpenLibrary
  finiva in cache, il successivo refresh dal client riceveva subito
  "isbn non trovato" senza nemmeno provare un nuovo fetch — lo spinner
  lampeggiava per una frazione di secondo e poi tornava all'icona
  "non disponibile". Ora il pulsante invia `?fresh=1` al server, che
  bypassa la cache e ri-interroga le fonti da capo. La cache positiva
  viene comunque aggiornata col nuovo risultato per gli accessi
  successivi.

## [0.1.18] - 2026-05-03

### Fixed

- **Sidebar che scorreva via con la pagina**: la shell aveva
  `min-height: 100dvh` invece di `height: 100dvh`, quindi cresceva
  con il contenuto e la colonna grid della sidebar scrollava insieme
  alla pagina. Ora la shell è ancorata al viewport e lo scroll
  avviene solo all'interno dell'area contenuto, lasciando la sidebar
  sempre visibile a lato.

## [0.1.17] - 2026-05-03

### Fixed

- **Statistiche → Generi/Lingue: tooltip mostrava il rank invece del
  conteggio**: sui bar chart orizzontali (`indexAxis: 'y'`), `parsed.y`
  è l'indice di categoria, non il valore. Ora il callback usa
  `ctx.raw`, che è sempre il dato sorgente, valido per tutti i tipi di
  chart (bar verticale/orizzontale, line, doughnut).
- **Statistiche → Riempimento scaffali sempre 0%** (server): la query
  contava da `books.location_shelf`, campo che non viene mai aggiornato
  dal flusso di assegnazione. Ora conta da `shelf_books` (la tabella
  reale di placement).
- **Statistiche → Generi mal aggregati** (server): la query
  raggruppava sull'intero breadcrumb BISAC ("Fiction / Science Fiction
  / Hard SF" come bucket unico), producendo decine di categorie con
  count=1 invece di poche categorie con count alto. Ora estrae il
  segmento finale (leaf) e fa il match case-insensitive.

## [0.1.16] - 2026-05-03

### Fixed

- **Pannello "Aggiornamenti" bianco in tema scuro**: il color-mix
  partiva da `--p-surface-0` (che resta bianco in PrimeVue anche in
  dark mode), producendo un riquadro chiaro fuori palette. Aggiunte
  override `:global(.dark)` con base `--p-surface-800`.
- **Tag genere overflow nella card libro**: i chip su una sola riga
  flex non andavano a capo e venivano tagliati oltre il bordo della
  card. Ora `flex-wrap: wrap` + ellipsis sui chip troppo lunghi.

## [0.1.14] - 2026-05-03

### Fixed

- **Copertine fantasma**: la cache locale (v9, introdotta in 0.1.12)
  conteneva blob spazzatura prodotti dal vecchio bug di decoding
  base64. Anche dopo il fix di 0.1.13, i record corrotti restavano in
  IndexedDB e impedivano la visualizzazione. Bump a v10 con wipe
  one-shot: alla prima apertura le copertine vengono ri-scaricate da
  zero.
- Quando l'`<img>` fallisce a decodificare un blob (URL stale, blob
  corrotto), il record viene cancellato automaticamente dall'IDB cosi'
  il prossimo accesso riparte pulito.

### Added

- **Indicatore di stato per ogni copertina**: piccolo badge in basso a
  destra mostra in tempo reale se la copertina sta venendo scaricata
  (spinner sage), se il download e' fallito (triangolo rosso), o se
  non e' disponibile sui provider (icona grigia).
- **Pulsante "ricarica" per ogni copertina**: in alto a destra,
  visibile su hover (sempre visibile in caso di errore o copertina
  non trovata). Forza un nuovo lookup metadata + download bypassando
  cache locale e blacklist negativa.

## [0.1.13] - 2026-05-03

### Fixed

- **Le copertine ora si vedono davvero**: il decoder dei bytes
  ricevuti dal backend interpretava male il formato di trasporto
  (base64 invece di array) e produceva immagini vuote. Risolto.

## [0.1.12] - 2026-05-03

### Fixed

- **Le copertine ora sono persistenti**: i bytes vengono salvati
  direttamente nella cache locale invece del solo URL, quindi
  sopravvivono ad aggiornamenti, riavvii dell'app e svuotamenti del
  cache HTTP del browser interno. Non vengono più riscaricate ad
  ogni avvio.
- **Aggiornamento dell'app non azzera più la cache copertine**:
  il database locale ora si aggiorna senza cancellare i record
  esistenti.

## [0.1.11] - 2026-05-03

### Fixed

- **Aggiornamento visibile e affidabile**: l'installer ora mostra
  brevemente una finestra di progresso (~2 secondi) invece di girare
  silenziosamente. Risolve definitivamente i casi in cui l'app si
  chiudeva senza essere effettivamente aggiornata: gli errori non sono
  più nascosti dalla modalità silent.

## [0.1.10] - 2026-05-03

### Fixed

- **Auto-updater affidabile su Windows**: l'aggiornamento ora chiude
  correttamente la versione precedente, sostituisce sempre i file e
  rilancia in automatico la nuova versione, anche in modalità silent.
  In precedenza l'app si chiudeva ma non veniva sostituita né
  riavviata.

## [0.1.0] - 2026-01-15

Prima release pubblica del client desktop Bookeeper.


- **Autenticazione end-to-end**: pairing device con invite code,
  certificati mTLS per dispositivo, refresh token automatico.
- **Sessione persistente**: opzione "ricordami su questo dispositivo"
  con riavvio dell'app senza nuovo login.
- **UI sessione scaduta**: banner chiaro su LoginView quando il refresh
  token decade, con redirect automatico.
- **Copertine libri**: ricerca automatica via Google Books + fallback
  su Open Library, con cache locale dedicata per dispositivo.
- **Auto-updater**: controllo aggiornamenti automatico all'avvio,
  download verificato via SHA-256, installazione silent in un click.
- **Tab Info nelle Impostazioni**: versione corrente, build date,
  bottone "Controlla aggiornamenti".


## [0.1.1] - 2026-01-15

- **Migliorie UI Updater**

## [0.1.2] - 2026-01-15

- **Update appicon**

## [0.1.4] - 2026-01-15

- **self elevation**

## [0.1.5] - 2026-01-15

- **Nuovo lookup**
-**Nuove categorie da google books**

## [0.1.6] - 2026-01-15

- **fix e docs flusso login e creazione nuovi tenant**

## [0.1.7] - 2026-01-15

- **MIGLIORMAENTI LOOKUP ISBN**

## [0.1.8] - 2026-01-15

- **hotfix copertine**
-**hotfix updater**