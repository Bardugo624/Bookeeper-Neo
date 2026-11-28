# Il lettore di e-book (fase 10B) — design

Data: 2026-11-28. Stato: da approvare.

Questo documento disegna le schermate e fissa le scelte tecniche che la specifica degli e-book lasciava al costruttore. La parte funzionale resta quella approvata: `docs/superpowers/specs/2026-11-27-ebook-design.md`, sezione «Fase 10B — Il lettore».

- Gli stati disegnati sono in `docs/superpowers/specs/2026-11-28-lettore/`.
- Il brief della superficie, con il contratto della direzione, è in `apps/desktop/.impeccable/surfaces/src-modules-reader-readerview-tsx.md`.
- La prova del motore è in `docs/superpowers/research/2026-11-28-prova-motore-lettore.md`.

## Decisioni del proprietario

- **Struttura: «Pannello compagno».** Il proprietario l'ha scelta fra tre schizzi: pannello compagno, barra del tempo e binario nel margine.
- **«Sparisce, torna al tocco».** Mentre leggi restano solo la pagina e una linea sottile. I controlli tornano col tocco, col mouse o con Esc.
- **«Scorre di lato».** La pagina scorre di lato e segue il dito; con il movimento ridotto cambia di colpo.
- **«Come l'app e l'editore».** Il tema di partenza segue l'app, chiaro o scuro. Carattere e stili di partenza sono quelli dell'editore. Le regolazioni valgono per tutti i libri su quel dispositivo.
- **Motore:** foliate-js, confermato dalla prova in Chromium, WebKit e Firefox. La prova sull'iPhone è stata saltata per scelta del proprietario.

## Obiettivi

1. Leggere EPUB, MOBI/AZW3, FB2, CBZ e PDF nell'app, sul computer e sul telefono.
2. Girare pagina senza ritardo percepibile.
3. La posizione non salta mai da sola.
4. Note ed evidenziazioni private, sincronizzate fra i dispositivi della persona, esportabili in Markdown.
5. Leggere offline sul telefono.
6. Un libro non esegue codice e non fa richieste di rete.

## Non obiettivi

- Lettura ad alta voce e dizionario.
- Regolazioni diverse per ogni libro.
- Note condivise con la famiglia.
- Lettori e-ink: sono la fase 10C.

## Cosa sarebbe un fallimento anche se funziona

- **La pagina che si sposta** quando cambia la finestra, il tema, il carattere o il pannello. Ogni nuova impaginazione riparte dalla posizione esatta (CFI).
- **I controlli che saltano fuori mentre leggi**, per esempio quando il mouse attraversa la pagina.
- **Un'evidenziazione illeggibile** nel tema scuro o nero.
- **Una nota persa** perché il telefono era senza rete.
- **La ricerca che blocca la pagina** su un libro grande.
- **Un lettore che sembra un'altra app:** i controlli vengono dal kit e i colori da `DESIGN.md`.

## Come si usa

### Aprire un libro

- Si apre da «Leggi» nella scheda del libro e dalla card «In lettura».
  - Se il libro è già iniziato, il pulsante dice «Leggi · 4%».
  - Se il libro ha più file, «Leggi» apre l'EPUB (poi gli altri formati a pagine riflowabili, per ultimo il PDF). Gli altri file si aprono da un menu accanto.
- **Sul computer** il lettore prende tutta la finestra, senza barra laterale; il titolo della finestra è quello del libro.
- **Sul telefono** prende tutto lo schermo, senza la barra delle schede.
- Il libro si apre dove l'avevi lasciato **su quel dispositivo**, o dall'inizio. I controlli sono visibili e spariscono alla prima pagina girata.
- **Mentre carica** compare la copertina con «Apro il libro…», solo se serve più di 300 ms.
- **Gli errori** si mostrano al posto della pagina, con una frase e un'azione:
  - «Questo file non si apre», con «Scarica il file»;
  - «Il file manca sul server», lo stato «file mancante» della 10A;
  - «Sei offline e questo libro non è sul telefono».

### Leggere (`01-lettura.png`)

- Mentre leggi ci sono solo il testo e una linea di 2 px in fondo, che mostra l'avanzamento.
- **Girare pagina:**
  - con le frecce, Pagina su e Pagina giù, la barra spaziatrice;
  - con un clic nel terzo esterno della pagina, a sinistra indietro e a destra avanti;
  - con la rotella o con lo scorrimento sul trackpad;
  - sul telefono, con un tocco ai lati o con il dito, che la pagina segue.
- La pagina scorre di lato in `--bk-dur` con `--bk-ease`. Con il movimento ridotto cambia di colpo.
- **I controlli tornano:**
  - con un tocco al centro della pagina, sul telefono;
  - portando il mouse vicino al bordo alto o basso della finestra, sul computer;
  - con Esc.

  Un clic al centro della pagina, sul computer, non fa nulla: serve per selezionare il testo.
- Due pagine affiancate quando la pagina è larga almeno 1000 px, se la regolazione è accesa.
- Con lo **scorrimento** il capitolo scorre in verticale; in fondo si passa al capitolo dopo.

### I controlli (`02-note.png`)

- **Barra in alto:**
  - a sinistra «Indietro», che torna dove eri;
  - al centro il titolo e il capitolo;
  - a destra Cerca, Segnalibro, Aspetto e Pannello. Il segnalibro è pieno quando la pagina ne ha uno.
- **Barra in basso:**
  - la barra di avanzamento con le tacche dei capitoli. Trascinandola compare «Capitolo VIII · 21%», e al rilascio si salta lì;
  - la percentuale e il tempo che manca alla fine del capitolo e del libro.
- **Il pannello compagno**, largo 360 px a destra, ha tre schede: Indice, Note e Cerca.
  - Sopra i 1100 px di finestra spinge la pagina, che si reimpagina dalla stessa posizione. Sotto copre la pagina, come un cassetto.
  - Aperto o chiuso, il pannello resta com'era la volta prima su quel dispositivo.
- **Tastiera:** Esc chiude lo strato più in alto (finestrella, poi pannello), poi mostra o nasconde i controlli. Ctrl/Cmd+F apre la ricerca.

### L'indice

- I capitoli con i sottocapitoli. Quello corrente è evidenziato e visibile senza scorrere.
- Ogni riga mostra a destra la percentuale dove comincia il capitolo.
- Un clic salta al capitolo.

### Note e segnalibri (`02-note.png`, `07-telefono.png`)

- **Il segnalibro** si mette e si toglie dalla barra in alto.
- **L'elenco** contiene evidenziazioni e segnalibri, in ordine di libro. Si filtra con «Tutte», «Segnalibri» e i quattro colori.
- **Ogni voce** mostra:
  - il colore o il segnalibro;
  - il capitolo e la percentuale;
  - il testo, in Lora;
  - la nota della persona, se c'è.
- Un clic porta alla voce. Il menu della voce ha «Modifica la nota», «Cambia colore», «Copia» e «Togli».
  - «Togli» non chiede conferma: un avviso offre «Annulla».
- In fondo: «Visibili solo a te» ed «Esporta in Markdown».

### Selezionare il testo (`03-selezione.png`)

- Sopra la selezione compare una barra; sul telefono sta sotto, per non coprire il menu del sistema. Contiene:
  - i quattro colori: Ambra, Salvia, Terracotta, Notte;
  - «Nota», «Copia» e «Cerca sul web».
- **Un colore** evidenzia subito.
- **«Nota»** evidenzia nell'ultimo colore usato e apre la nota: una finestrella sul computer, un foglio dal basso sul telefono.
- **Un'evidenziazione esistente**, toccata, mostra la stessa barra con il suo colore segnato, più «Togli».
- Le evidenziazioni con una nota hanno un piccolo segno alla fine.
- **«Cerca sul web»** apre il browser del sistema con una ricerca DuckDuckGo del testo scelto.

### Aspetto (`04-aspetto.png`, `08-offline.png`)

- Una finestrella dal pulsante Aa sul computer, un foglio dal basso sul telefono. I cambi si vedono subito.
- **Tema:** Auto (come l'app), Chiaro, Seppia, Scuro, Nero.
- **Carattere:** Editore, Lora, Inter, Serif e Sans (quelli del sistema). Ogni nome è scritto nel suo carattere.
- **Dimensione:** da 12 a 32 px, con − e +.
- **Interlinea:** 1,4, 1,6 o 1,8.
- **Margini:** stretti, medi, ampi.
- **Impaginazione:** Pagine o Scorrimento, e «Due pagine quando c'è spazio».
- **Interruttori:** «Giustifica il testo», «Sillabazione», «Stili dell'editore».
- In fondo: «Vale per tutti i libri su questo computer» (o «telefono») e «Ripristina».
- **Valori di partenza:** Auto, Editore, 18 px, 1,6, medi, Pagine, due pagine sì, giustifica sì, sillabazione sì, stili dell'editore sì.
- **Stili dell'editore spenti:** valgono solo carattere, allineamento e spaziature scelte qui. Accesi: resta il foglio di stile del libro, tranne i colori del tema e la dimensione.
- **Per i PDF** contano solo tema, zoom («Adatta alla larghezza» o «alla pagina») e due pagine. Le altre righe sono spente, con la frase «Per i PDF valgono tema e zoom».

### «Continua da …» (`05-continua.png`)

- All'apertura il lettore confronta la posizione di quel dispositivo con le altre:
  - le posizioni degli altri dispositivi della persona, per lo stesso file;
  - il progresso unico della persona, `progress_percent`.
- Se una di queste è più avanti di almeno l'1% ed è più recente, la barra in basso lo chiede e resta finché la persona non sceglie:
  - «Continua da dove eri sul telefono?», con la percentuale, il capitolo e quando;
  - i pulsanti «Resta qui» e «Vai al 45%».
- **La fonte ha un nome:** «sul telefono», «sul computer», «su KOReader», «sul Kobo». Per la pagina scritta a mano: «Hai segnato pagina 212 (45%)».
- Girare pagina vale «Resta qui». Esc anche.
- **«Vai al 45%»** usa la posizione esatta se viene da un lettore Bookeeper con lo stesso file; altrimenti la percentuale. Poi compare «Torna al 4%».
- Il lettore non salta mai da solo.

### Cercare nel libro (`06-cerca.png`)

- La scheda Cerca ha il campo, poi i risultati raggruppati per capitolo, con un pezzo di frase e la parola in evidenza.
- **I risultati arrivano mentre cerca;** in fondo «Cerco nel resto del libro… 60%». Una nuova ricerca ferma la precedente.
- Servono almeno 2 caratteri.
- **Il risultato scelto** ha un contorno sulla pagina; gli altri sono sottolineati.
- La pagina resta reattiva anche sui libri grandi.

### «Torna al …»

- Dopo ogni salto (indice, nota, risultato, barra, «Vai al 45%») la barra in basso mostra «Torna al 4%».
- Sparisce dopo due pagine girate in avanti dal nuovo punto, o quando la si usa.

### Fine del libro

- All'ultima pagina la barra in basso chiede: «Hai finito il libro. Segnarlo come letto?», con «Non ancora» e «Segna come letto».
- Non lo fa da solo.

### Sul telefono (`07-telefono.png`, `08-offline.png`)

- **Mentre leggi:** il testo e la linea sottile, dentro le aree sicure.
- **Un tocco al centro** mostra:
  - in alto: indietro, il titolo, Aa e «⋯»;
  - in basso: la barra di avanzamento con la percentuale, poi Indice, Note, Cerca e Segna, ognuno di almeno 44×48 px.
- I controlli coprono la pagina senza spostarla.
- **Il pannello** diventa un foglio dal basso con le stesse schede. Si apre al 70% e si tira fino in cima.
- **Il menu «⋯»** ha «Scarica per leggere offline» (o «Togli dal telefono») e «Apri la scheda del libro».

### Offline sul telefono (`08-offline.png`)

- **«Scarica per leggere offline»** sta nella scheda del libro, sotto «Leggi», e nel menu «⋯» del lettore. Gli stati:
  - «Scarico… 40%», con «Annulla»;
  - «Sul telefono · 2,4 MB», con «Togli dal telefono».
- **Il file va nel browser (OPFS).** Al primo scaricamento il lettore chiede al browser di non cancellare i dati (`navigator.storage.persist()`).
- **Senza rete,** posizioni, segnalibri ed evidenziazioni aspettano in IndexedDB e partono al ritorno della rete. Ognuno porta la sua ora.
- **Su iPhone, da Safari e non dalla schermata Home,** il pulsante apre la spiegazione:
  - perché: da Safari i libri possono sparire dopo qualche giorno;
  - i tre passi: Condividi, «Aggiungi alla schermata Home», apri Bookeeper da lì.

  Si legge comunque online.

### «In lettura» (`09-in-lettura.png`)

- La card «In lettura» della specifica degli e-book non esiste ancora: nasce qui.
- **Sul computer** è una riga in cima alla libreria, sopra la griglia, con al massimo quattro card. Si vede quando non ci sono filtri né ricerche. Ogni card ha:
  - la copertina;
  - titolo e autore;
  - la barra di avanzamento con la percentuale.
- **Sul telefono** è una riga che scorre di lato, in cima a Cerca, quando il campo è vuoto.
- **Quali libri:** quelli in stato «In lettura» con almeno un file, prima quelli letti più di recente.
- **Le azioni:**
  - un clic sulla card riprende la lettura;
  - «Tutti i 5» apre la libreria filtrata su «In lettura».
- Nella scheda del libro, la card «Lettura» riceve «Continua · 45%» quando il libro è in lettura e ha un file.

### Accessibilità

- Tutto si fa da tastiera. Il fuoco è sempre visibile.
- Le finestrelle e i fogli tengono il fuoco e lo restituiscono quando si chiudono.
- La barra di avanzamento è un cursore, con un testo come «4%, Capitolo I».
- La domanda «Continua da …» e il numero dei risultati si annunciano (`aria-live="polite"`).
- **Testo a 4,5:1** in ogni tema, anche sopra le quattro velature. Lo verifica un test.
- **Bersagli:** almeno 24 px sul computer e 44 px sul telefono.
- Il movimento ridotto spegne ogni scorrimento.

## Come è fatto

### Il pacchetto

- `packages/reader` (`@bookeeper/reader`) contiene motore, recinto, modello, interfaccia e sincronizzazione. Le due app lo usano uguale e lo caricano solo quando si apre il lettore.
- **foliate-js** è copiato intero e senza modifiche, al commit `78914ae` della prova, con i moduli di tutti i formati e il suo pdf.js 5.5.207 (comprese le mappe dei caratteri).
  - I file si servono statici sotto `/reader/foliate-js/`, come nella prova.
  - Un plugin di Vite del pacchetto li serve durante lo sviluppo e li copia nella build.

### Il recinto

- Il motore gira in una pagina sua, `reader-frame.html`, dentro un iframe della vista del lettore. La pagina ha questa regola di sicurezza (CSP):

  ```
  default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline' blob:; img-src blob: data:; font-src 'self' blob: data:; media-src blob:; connect-src 'self' blob: data:; worker-src 'self' blob:; frame-src blob:; object-src 'none'; base-uri 'none'; form-action 'none'
  ```

- foliate-js crea le cornici del libro da indirizzi `blob:`, ed esse ereditano la regola: la prova lo ha verificato in Chromium, WebKit e Firefox.
- **Vista e motore si parlano con messaggi** (`postMessage`), con un protocollo fisso.
  - La vista manda il file come Blob.
  - Il motore non chiede alla rete altro che i suoi file.
- **Il server** risponde a `reader-frame.html` con `X-Frame-Options: SAMEORIGIN`. Oggi tutte le pagine sono `DENY`, e la cornice non si aprirebbe.
- **Un test in tre motori** (Chromium, WebKit, Firefox) passa dalla pagina vera:
  - il libro ostile non esegue nulla e non fa uscire richieste;
  - 100 pagine girano con il 95° percentile sotto i 100 ms;
  - il lettore si chiude senza errori.

  Questo test prende il posto della prova: la pagina di prova, i suoi script e il suo workflow vanno via.

### I dati

- **La tabella `annotations`** (migrazione 0006) ha:
  - l'id, un UUID creato dal dispositivo;
  - libreria, persona, libro e sha256 del file;
  - il tipo, evidenziazione o segnalibro;
  - la posizione (CFI), il testo, il colore, la nota, la percentuale e il capitolo;
  - le ore di creazione, modifica e cancellazione.

  È privata per persona ed entra nei backup.
- **L'API:**
  - `GET /api/v1/books/{id}/annotations`, con `?since=` per avere solo le modifiche, cancellazioni comprese;
  - `PUT /api/v1/books/{id}/annotations/{annotation_id}`, che crea, modifica o cancella (`deleted: true`). Vince l'ultima modifica, in base all'ora.
  - `guest` riceve 403.
- **Le posizioni** usano l'API della 10A. `PositionOut` riceve `device_kind`, per scrivere «sul telefono» o «sul computer».
- **Sul dispositivo** restano:
  - l'ultima posizione di ogni file, da cui il libro si apre;
  - le regolazioni (`bookeeper.reader.settings`);
  - la velocità di lettura (`bookeeper.reader.speed`).

### Sul computer

- **Il lettore è la rotta `/read/:bookId`, fuori dalla cornice dell'app.** La barra in alto del lettore è anche la barra della finestra: si trascina e ha a destra i tre pulsanti della finestra.
- **Il file arriva così:**
  - un comando Tauri lo copia nella cache dell'app, `<cache>/reader/<sha256>.<ext>`, a flusso;
  - la vista lo legge con il protocollo `asset`, limitato a quella cartella;
  - la cache tiene gli ultimi 10 libri.
- **Trovato preparando il piano:** con una libreria locale il core nel processo non riceve la sessione. L'intestazione `Authorization` viene scartata, e ogni chiamata protetta risponde 401. L'ho verificato con un test. Il piano lo corregge per primo.

### Sul telefono

- Il lettore è la rotta `/read/:bookId`, fuori dalla barra delle schede.
- **Offline:**
  - i file vanno in OPFS, in `books/<sha256>.<ext>`;
  - l'elenco dei libri offline e la coda delle modifiche vanno in IndexedDB, nel database `bookeeper-reader`.
- **Il service worker** tiene pronti i file del lettore, foliate-js e pdf.js. Il limite per file sale a 4 MB, perché il worker di pdf.js pesa 2,1 MB.

## Scelte mie, da controllare

- **Le domande nella barra in basso:** «Continua da …» e «Segna come letto» stanno nella barra in basso, mai sopra il testo. Girare pagina vale «Resta qui».
- **La partenza:** il libro si apre dalla posizione di quel dispositivo; anche alla prima apertura su un dispositivo nuovo, chiede invece di saltare.
- **La selezione:** è quella del sistema (azzurra), così non si confonde con le evidenziazioni.
- **I colori delle evidenziazioni** sono quelli dei mobili: ambra, salvia, terracotta, notte.
- **«Cerca sul web»** usa DuckDuckGo.
- **Il pannello** spinge la pagina sopra i 1100 px di finestra e la copre sotto.
- **Clic e mouse sul computer:**
  - il clic gira pagina solo nel terzo esterno; al centro serve per selezionare;
  - i controlli tornano col mouse solo vicino ai bordi alto e basso.
- **Le regolazioni** non viaggiano fra i dispositivi.
- **L'esportazione** in Markdown si fa sul dispositivo, come file.
- **Più file nello stesso libro:** «Leggi» apre l'EPUB per primo.
- **Il tempo che manca** si vede dopo qualche minuto di lettura su quel dispositivo.
- **«In lettura»** sta in cima alla libreria del computer e in cima a Cerca sul telefono.
- **Il repository** riceve foliate-js con il suo pdf.js: circa 5 MB, senza dipendenze npm nuove per il motore.
- **Sul computer** i libri aperti restano nella cache dell'app: gli ultimi 10.
- **Sul telefono** pdf.js è nella cache iniziale anche se non apri mai un PDF: circa 3 MB in più, ma i PDF si leggono offline.

## Lasciato al costruttore

- I nomi dei componenti e dei messaggi fra la pagina e il motore.
- L'algoritmo della velocità di lettura, nei limiti scritti sopra.
- I tasti oltre a quelli elencati.
- Le soglie esatte dei gesti sul telefono.
