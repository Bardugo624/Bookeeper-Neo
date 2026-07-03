# Changelog

Tutte le modifiche significative al client desktop Bookeeper sono
documentate qui. Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/)
e il versioning aderisce a [Semantic Versioning](https://semver.org/lang/it/).

L'auto-updater dell'app legge la sezione corrispondente alla versione
pubblicata e la mostra nella dialog "Vedi novità". Sono supportati:

- heading `##`/`###`
- liste `-`/`*` e numerate
- enfasi `**bold**` / `*italic*`
- inline code `` ` ``
- link `[text](https://...)`


## [0.2.0]

- restyle login, client-side hosting
- refactoring backend stage 1

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