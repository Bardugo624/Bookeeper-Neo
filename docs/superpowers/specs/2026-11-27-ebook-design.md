# E-book in Bookeeper: file, lettore e lettori e-ink — design

Data: 2026-11-27. Stato: da approvare. Il documento è passato da un controllo indipendente; le risposte sono qui dentro.

I rapporti di ricerca sono in `docs/superpowers/research/`:
- `2026-11-27-ebook-esperienza.md`: le app di lettura esistenti, cosa piace e cosa no;
- `2026-11-27-ebook-tecnica.md`: motori di lettura, crate Rust, protocolli, archiviazione e sicurezza;
- `2026-11-27-ebook-dispositivi.md`: i lettori e-ink.

## Perché

Il proprietario vuole due cose:
- un lettore di e-book completo, moderno e piacevole, dentro l'app;
- la gestione dei file degli e-book nella libreria, accanto ai libri di carta.

Oggi un e-book in Bookeeper è solo una scheda, con il formato «ebook»: il file non c'è.

## Decisioni del proprietario

- **Il lettore è dentro l'app**, sul computer e sul telefono. Deve essere completo, moderno e piacevole.
- **Ogni e-book si scarica** da tutti i dispositivi collegati alla libreria.
- **La posizione di lettura** si sincronizza fra i dispositivi e aggiorna la percentuale di completamento che l'app già mostra, cioè l'anello di lettura.
- **Il resto della proposta è approvato:**
  - i file stanno dove sta la libreria: sul PC, oppure sul server;
  - i backup degli e-book sono separati;
  - la posizione è per persona;
  - si leggono solo file senza DRM.
- **I lettori e-ink si integrano dove è possibile**, «in maniera seamless». Vengono prima Kobo e KOReader.
- **Il motore del lettore** è stato lasciato a me. Ho proposto foliate-js, e nessuna obiezione.

## Obiettivi

1. Ogni libro può avere uno o più file: EPUB, PDF e gli altri formati che il lettore apre. Il file si carica dal computer o dal telefono e si scarica da ogni dispositivo.
2. Si legge nell'app, sul computer e sul telefono, anche offline sul telefono. Ci sono le regolazioni che i lettori si aspettano: caratteri, temi, indice, ricerca, segnalibri ed evidenziazioni con note.
3. Ogni persona ha un solo progresso per libro, che tu legga su carta, nell'app o su un lettore e-ink. L'anello di lettura lo mostra.
4. Un lettore con KOReader sfoglia la libreria, scarica i libri e sincronizza la posizione.
5. Un Kobo di serie riceve i libri scelti e sincronizza la posizione, nei due sensi.

## Non obiettivi

- Libri con DRM: non si aprono e non si convertono. Le schede degli acquisti protetti restano solo schede, come oggi.
- Invio a Kindle e a PocketBook per email: è un lavoro successivo.
- Lettura ad alta voce e dizionario integrato: arrivano dopo la prima versione del lettore.
- Audiolibri.
- Un negozio, raccomandazioni o funzioni social.

## Cosa sarebbe un fallimento anche se funziona

- **La posizione che salta.** È il difetto più odiato nelle app esistenti. La posizione non deve mai spostarsi senza che la persona lo veda e lo accetti.
- **Pagine che girano con un ritardo percepibile.**
- **Note ed evidenziazioni chiuse dentro l'app.** Devono potersi esportare.
- **Un libro che esegue codice o contatta Internet.** I libri arrivano da fuori e vanno chiusi in un recinto.
- **Un file perso:** caricato e poi sparito, sovrascritto o rimasto fuori da qualunque copia di sicurezza senza che nessuno lo sappia.
- **I libri caricati trattati come di serie B** rispetto alle schede.

## Approcci considerati

**Motore del lettore**
- **Scelto: foliate-js, più pdf.js per i PDF.** È MIT e apre EPUB, MOBI/AZW3, FB2, CBZ e PDF. Lo usano Readest, che come Bookeeper è un'app Tauri 2, e Foliate su WebKitGTK. Pagina con le colonne CSS e ha la posizione in EPUB CFI.
  - Non ha versioni ufficiali: si copia nel repository, fissato a un commit, e si aggiorna a mano con i test.
  - La ricerca è lenta sui libri grandi, e non c'è lo scorrimento continuo fra capitoli.
- **Scartato: Readium ts-toolkit.** È lo standard di Thorium, molto attivo, con un buon modello di posizione e la lettura ad alta voce. Però apre solo EPUB e fumetti, e richiede un manifest e un servizio per ogni risorsa del libro nel core Rust: più lavoro, meno formati.
- **Scartato: epub.js.** È fermo dal 2022.

**Lettori e-ink.** L'ordine viene dal proprietario («prioritizza Kobo e KO»):
1. KOReader, con un catalogo OPDS 1.2 e il protocollo kosync. Sono protocolli aperti e stabili.
2. Kobo di serie, imitando le API del negozio Kobo come fanno Calibre-Web, Komga e Booklore. È fragile: il protocollo non è documentato e alcuni modelli recenti cancellano la configurazione.
3. Più avanti, Kindle e PocketBook per email. Su questi la posizione non torna indietro.

## Com'è oggi

- `books` ha `format IN ('hardcover','paperback','ebook','audiobook')`, ma nessun file.
- Le copertine stanno in `<dati>/covers`, scritte dal core (`crates/bookeeper-core/src/api/covers.rs`).
- `reading` ha, per persona e per libro, lo stato, le date, il voto, la nota e `current_page` (migrazione 0002). L'anello di lettura mostra `current_page / page_count`.
- **Ruoli:** `owner`, `admin`, `member`, `guest`.
- **Backup:** un archivio arriva al massimo a 200 MB, e ogni voce al massimo a 20 MB (`backup.rs`). Gli e-book non ci stanno.
- **Telefono:** la PWA ha già un service worker e IndexedDB (l'indice per la scansione).
- **Rete di casa:** il computer può condividere la libreria sulla rete (`apps/desktop/src-tauri/src/sharing.rs`).
- **Indirizzi:** il server di produzione è dietro Caddy, in HTTPS.

## Design

Tre fasi, ognuna con il suo run Forge e la sua release: 10A, 10B e 10C (prima KOReader, poi Kobo).

### Fase 10A — E-book nella libreria

**Dati**
- **Nuova tabella `book_files`:** `id`, `book_id`, `format`, `size_bytes`, `sha256`, il nome originale, `koreader_hash` (l'MD5 parziale di kosync, calcolato al caricamento), `uploaded_by`, `created_at`.
  - Un libro può avere più file, per esempio EPUB e PDF.
  - Il file si attacca a qualunque libro, di carta o no. Un libro senza scheda di carta ha `format = 'ebook'`.
- **I file su disco** stanno in `<dati>/ebooks/<sha256>.<ext>` e non cambiano mai dopo il caricamento. Questo serve a kosync, che riconosce il libro dall'hash, e ai backup incrementali.
  - Un file identico già presente non si duplica.
  - Togliere un file dal libro cancella il file su disco solo se nessun altro libro lo usa.

**Progresso unico**
- `reading` riceve `progress_percent` (0–100), `progress_at` e `progress_device_id`.
- Una nuova tabella `reading_positions` tiene, per persona e per file, la posizione nel formato di chi l'ha scritta: CFI dal lettore Bookeeper, xpointer da KOReader, Location da Kobo. Tiene anche la percentuale e l'ora.
- **L'anello mostra `progress_percent`.** Per i libri con `page_count`:
  - dalla pagina scritta a mano si ricava la percentuale;
  - dalla percentuale di un lettore si ricava la pagina, arrotondata.
- **L'ultima scrittura vince**, in base all'ora.
- **Fine del libro:** arrivato in fondo, il lettore propone «Segna come letto». Non lo fa da solo.

**Caricare**
- **Da dove:** dalla scheda del libro («Aggiungi il file»), trascinando un file sulla scheda, oppure trascinando degli e-book sulla libreria. In quest'ultimo caso nasce un libro nuovo per ogni file, con i metadati letti dal file e una conferma prima di salvare.
- **Formati accettati:**
  - EPUB e PDF, con lettura dei metadati;
  - MOBI/AZW3, FB2 e CBZ come file da leggere, con metadati da scrivere a mano.
- **Limite:** 200 MB per file, regolabile sul server.
- **File protetti:** un EPUB con DRM Adobe o LCP, o un PDF cifrato, si rifiuta con un messaggio chiaro.

**Metadati**
- EPUB con `rbook` (Apache-2.0). NON `epub`, che è GPL.
- PDF con `lopdf` (MIT).
- La copertina del file diventa quella del libro, se il libro non ne ha una.

**Scaricare**
- Da ogni dispositivo collegato. Il server risponde alle richieste a intervalli (range).
- Il nome del file scaricato è «Autore - Titolo.ext».

**Permessi**
- Caricare e togliere: chi può già modificare i libri.
- Leggere e scaricare: tutti i ruoli tranne `guest`, che continua a vedere solo le schede.

**Registro:** «ha aggiunto il file EPUB a …» e «ha tolto il file …».

**Backup**
- L'archivio normale non contiene gli e-book, ma ne elenca hash e libri. Così, dopo un ripristino, i file presenti nella cartella `ebooks/` si ricollegano da soli. Quelli che mancano si vedono come «file mancante».
- Le Impostazioni spiegano come copiare la cartella `ebooks/`. Siccome i file non cambiano mai, una copia incrementale basta.

### Fase 10B — Il lettore

**Dove**
- Una vista a tutto schermo, sul computer e sul telefono, che si apre da «Leggi» nella scheda del libro e dalla card «In lettura».
- Il lettore va in `packages/ui`, o in un pacchetto suo, così il computer e la PWA usano lo stesso codice.

**Motore:** foliate-js copiato nel repository e fissato a un commit, più pdf.js.

**Recinto**
- Nessuno script di un libro va eseguito e nessuna richiesta di un libro esce verso Internet.
- foliate-js stesso dice che il sandbox degli iframe su WebKit non basta (bug 218086). Il contenuto quindi si serve con una CSP rigida (`script-src 'none'`, niente rete), possibilmente da un'origine separata.
- Il meccanismo esatto lo sceglie il costruttore. Un test deve provare che un EPUB con uno script e un'immagine remota non esegue né carica nulla.

**Lettura**
- Pagine o scorrimento; due pagine affiancate sulle finestre larghe.
- Girare pagina con tasti, clic, tocco e scorrimento del dito, senza ritardo percepibile.

**Caratteri**
- Famiglia: quella dell'editore, serif, sans, e i caratteri dell'app.
- Dimensione, interlinea, margini, giustificazione e sillabazione.
- «Stili dell'editore» acceso o spento.

**Temi:** chiaro, seppia, scuro e nero, dalla palette di Bookeeper. Le regolazioni valgono per persona e per dispositivo.

**Orientarsi**
- L'indice.
- Una barra di avanzamento con i segni dei capitoli.
- La percentuale e il tempo che manca alla fine del capitolo e del libro, stimato sulla velocità di lettura della persona.
- La ricerca nel libro.

**Segnalibri ed evidenziazioni**
- Le evidenziazioni hanno quattro colori e possono avere una nota.
- Un elenco per libro.
- Esportazione in Markdown.
- Sono private per persona e si sincronizzano fra i suoi dispositivi, con la tabella `annotations`.

**Selezione di testo:** evidenzia, aggiungi una nota, copia, cerca sul web.

**Posizione**
- Si salva quando la pagina gira (con un piccolo ritardo) e quando il lettore si chiude.
- All'apertura, se un altro dispositivo è più avanti, il lettore chiede: «Continua da dove eri sul telefono (45%)?». Non salta mai da solo.

**Offline sul telefono**
- Il pulsante «Scarica per leggere offline» salva il file nel browser (OPFS).
- Le posizioni aspettano in IndexedDB e si inviano al ritorno della rete.
- Su iPhone serve la PWA installata nella schermata Home. Se non lo è, il lettore lo spiega.

**Prima di cominciare**, una prova di un giorno. Si apre un EPUB grande e si girano 100 pagine su:
- PWA installata su iPhone;
- Android;
- Windows (WebView2), macOS (WKWebView) e Linux (WebKitGTK).

La prova conferma il motore oppure riapre la scelta.

### Fase 10C — Lettori e-ink

**Solo con il server in HTTPS**, come il telefono. Le rotte `/opds`, `/kosync` e `/kobo` stanno in `bookeeper-server`, non nel router del core. La condivisione del PC sulla rete di casa non le espone, per due motivi:
- usa un certificato fatto in casa, che un lettore e-ink non può verificare;
- in HTTP semplice la password dei lettori viaggerebbe in chiaro.

Con una libreria sul PC, «Lettori e-ink» spiega che serve il server.

**10C-1, KOReader**
- **Credenziali:** nelle Impostazioni, «Lettori e-ink» crea per ogni persona una password per i lettori, diversa da quella di accesso e revocabile.
- **Catalogo OPDS 1.2** su `/opds`, con autenticazione Basic. Contiene:
  - le novità;
  - i libri per scaffale, stanza e tag;
  - i libri «In lettura»;
  - la ricerca.

  Vi compaiono solo i libri con un file, e da lì si scarica il file originale.
- **kosync** su `/kosync` (`/users/auth`, `PUT /syncs/progress`, `GET /syncs/progress/:document`). L'hash del documento si trova in `book_files.koreader_hash`. La percentuale aggiorna il progresso della persona, e l'xpointer resta in `reading_positions`.
- Fra KOReader e il lettore Bookeeper vale la percentuale, che è approssimata. Per questo vale la regola del «Continua da …».

**10C-2, Kobo di serie**
- **Collegare il Kobo:** nelle Impostazioni, «Collega un Kobo» crea per la persona l'indirizzo `https://<server>/kobo/<token>`. Le istruzioni dicono come scriverlo in `api_endpoint`, nel file `.kobo/Kobo/Kobo eReader.conf`, via USB. Il token si può revocare.
- **Quali libri:** sul Kobo vanno i libri che la persona mette nell'elenco «Sul mio Kobo», purché abbiano un EPUB.
- **Cosa si sincronizza:** metadati, copertine, stato (letto, in lettura) e percentuale, nei due sensi. La Location del Kobo resta in `reading_positions`.
- **Niente salti all'indietro.** Sul Kobo non si può chiedere «Continua da …», quindi Bookeeper gli manda una posizione solo quando è più avanti di quella che il Kobo ha già. Il Kobo non torna mai indietro da solo, e il lettore Bookeeper continua a chiedere.
- **KEPUB:** convertire in KEPUB dà una posizione più precisa del capitolo. Se e come farlo lo sceglie il costruttore: una conversione nel core, sul modello di kepubify (MIT), oppure EPUB semplice con avanzamento per capitolo.
- **HTTPS** è necessario, perché il token sta nell'indirizzo.
- Si sa in anticipo che è fragile. Le Impostazioni mostrano l'ultima sincronizzazione del Kobo, così un problema si vede.

## Ordine di messa in opera

1. 10A e una release.
2. La prova del motore, poi 10B e una release.
3. 10C-1 e una release.
4. 10C-2 e una release.

Il proprietario decide dove vanno queste fasi rispetto a 9A (R2 e lo script `bk`), 9B (l'installer) e 9C (la pagina di accesso).

## Scelte mie, da controllare

- Un solo progresso per persona e per libro, che valga per carta, app ed e-ink.
- Il file si attacca a qualunque libro, e un libro può averne più di uno.
- 200 MB per file.
- `guest` vede le schede ma non legge e non scarica i file.
- L'archivio di backup elenca i file ma non li contiene; la cartella `ebooks/` si copia a parte.
- Le regolazioni di lettura valgono per persona e per dispositivo, senza regolazioni per singolo libro nella prima versione.
- La posizione non salta mai da sola: chiede sempre «Continua da …».
- Lettura ad alta voce e dizionario dopo la prima versione.
- Una password per i lettori e-ink, separata da quella di accesso.
- L'elenco «Sul mio Kobo» per scegliere cosa va sul Kobo.
- I lettori e-ink funzionano solo con il server in HTTPS: niente catalogo né sincronizzazioni sulla condivisione del PC.
- Al Kobo arrivano solo posizioni più avanti della sua.
- Le schede degli acquisti fatti sul negozio Kobo restano solo schede: leggere quei libri non aggiorna l'anello.

## Lasciato al costruttore

- I dettagli dello schema e delle migrazioni.
- Come copiare e aggiornare foliate-js nel repository.
- Il meccanismo del recinto e la CSP esatta.
- Come stimare la velocità di lettura.
- La conversione KEPUB.
- Il disegno delle schermate: con Impeccable, in modalità Operate, seguendo `DESIGN.md`.
