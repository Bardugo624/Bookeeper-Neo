# Pagina d'apertura con la citazione — design

Data: 2026-11-27. Stato: approvato dal proprietario. Il documento è passato da un controllo indipendente: le risposte sono qui dentro. Gli schizzi stanno in `2026-11-27-pagina-apertura/`, accanto a questo file.

## Perché

- La pagina di accesso della 0.x aveva la citazione di uno scrittore. Il proprietario la rivuole «ma modernizzata (Impeccable)».
- Per questo ha chiesto un centinaio di citazioni in italiano e in inglese, copiate da fonti pubblicate e non tradotte da noi. La raccolta è in `docs/citazioni/citazioni.json`.
- Oggi la pagina d'apertura dell'app desktop ha a sinistra «I tuoi libri, in ordine.», una promessa e quattro copertine finte.

## Decisioni del proprietario

- **Citazioni:** si usano tutte quelle verificate, che il proprietario le abbia tenute o no.
- **Struttura:** il pannello di sinistra diventa un frontespizio con la citazione, come nella 0.x e nel Setup. La parte destra resta com'è.
- **Quando cambia:** a ogni apertura una citazione nuova, mai una delle ultime uscite. Mentre la pagina è aperta resta ferma.
- **Setup:** anche il Setup usa le citazioni verificate.
- **Chi torna:** sopra la scheda «Bentornato in …» non c'è niente. «Come vuoi iniziare?» e il suo sottotitolo restano solo al primo avvio.

## Cosa vuol dire «verificata»

È la lettura della pagina di revisione che il proprietario ha usato:

- un testo è verificato se ha la spunta ✓ (`checked[lingua]`, ritrovato nella fonte);
- la citazione non deve avere l'etichetta «Da verificare», cioè deve avere `confidence: high`.

Si decide per lingua: l'italiano mostra solo i testi verificati in italiano, l'inglese solo quelli verificati in inglese.

| | Verificate | Fino a 110 caratteri e 2 righe | Fino a 200 caratteri |
|---|---|---|---|
| Italiano | 80 | 34 | 69 |
| Inglese | 48 | 21 | 44 |

Le 7 citazioni che il proprietario ha tenuto sono tutte verificate in tutte e due le lingue. Una citazione segnata «scarta» resterebbe fuori; oggi non ce ne sono.

## Obiettivi

1. La pagina d'apertura mostra a sinistra un frontespizio, sia al primo avvio sia in «Bentornato»:
   - il marchio;
   - la citazione;
   - autore e opera;
   - in fondo, in piccolo, la promessa di oggi.
2. A ogni apertura esce una citazione nuova nella lingua dell'app. Nessuna torna finché non sono uscite tutte.
3. Il Setup e l'app usano gli stessi dati e la stessa composizione della citazione.
4. Nel Setup il frontespizio compatto passa da 2 citazioni a 34 in italiano e 21 in inglese, contate sui testi già composti, dove i versi vanno a capo.

## Non obiettivi

- La parte destra della pagina: le tre strade, «Bentornato» e i moduli restano come sono. L'unica eccezione è il titolo sopra «Bentornato», che per chi torna non c'è più.
- La PWA del telefono.
- Citazioni nuove, traduzioni nostre, testi ritoccati: le parole restano quelle della fonte.
- Il modo di accedere e le password.
- Le finestre sotto i 900 px: esistono solo nel browser di sviluppo, perché la finestra dell'app non scende sotto 960×600. Lì il pannello resta nascosto come oggi.

## Cosa sarebbe un fallimento anche se funziona

- In una lingua compare un testo che in quella lingua non è verificato.
- Nella finestra minima, 960×600, una citazione lunga esce dal pannello o copre la promessa.
- Un verso di una poesia va a capo senza rientro, e sembra un verso nuovo.
- La citazione si muove mentre si scrive la password.
- La didascalia dice una cosa falsa: per esempio «W. Somerset Maugham · Pride and Prejudice», come se Maugham avesse scritto il romanzo. Oppure l'interfaccia italiana mostra descrizioni in inglese come «Remark to Jules Huret».
- Il Setup e l'app compongono la stessa citazione in due modi diversi.
- La stessa citazione esce due volte di fila.

## Approcci considerati

1. **Scelto: un pezzo solo, in `@bookeeper/ui/quote`.**
   - Contiene i dati generati, il componente che compone la citazione e la scelta «mai una delle ultime».
   - Il Setup e l'app lo importano tutti e due: una regola, nessuna copia.
   - Sta in `packages/ui`, così non serve un quarto pacchetto.
2. **Due copie**, un JSON e un componente per app. È più veloce oggi, ma la tipografia si dividerebbe col tempo.
3. **Citazioni dal server.** È escluso: la pagina d'apertura viene prima della connessione e deve funzionare senza rete.

## Come è fatto

### I dati

- **Generatore.** `scripts/quotes.mjs` prende il posto di `scripts/setup/quotes.mjs`:
  - legge `docs/citazioni/citazioni.json` e `scelte.json`;
  - scrive `packages/ui/src/quote/quotes.json`;
  - `apps/setup/src/quotes.json` sparisce.
- **Campi di ogni citazione:** `id`; il testo in `it` e in `en` (`null` se in quella lingua non è verificato); la didascalia per lingua, cioè autore e opera.
  - Il generatore tiene tutti i testi verificati, fino ai 250 caratteri della raccolta.
  - Ogni uso applica i suoi limiti: il Setup 110 e 200, la pagina d'apertura nessuno.
- **Composizione tipografica.** Le parole restano quelle della fonte. Cambiano solo i segni:
  - `'` diventa `’` e `...` diventa `…`, come nel Setup di oggi;
  - le virgolette basse interne diventano alte: «… “così” …»;
  - nei versi, « / » diventa un a capo;
  - un trattino fra spazi, o in fondo dopo uno spazio, diventa una lineetta «–».
- **Didascalie: l'autore** si scrive nella lingua dell'interfaccia. Tre autori latini hanno un nome diverso in inglese: Marco Tullio Cicerone (Cicero), Quinto Orazio Flacco (Horace), Plinio il Vecchio (Pliny the Elder).
- **Didascalie: l'opera**
  - È il titolo pubblicato, nella lingua originale. Si toglie tutto dalla prima « (» in poi, come oggi.
  - Senza capitolo, canto o sezione: «Our Mutual Friend», non «Our Mutual Friend, book I, ch. 3».
  - Quando il campo `work` descrive invece di dare un titolo, la didascalia mostra solo l'autore. Succede per Keats, Johnson, Plinio, Mallarmé e Maugham.
  - Una tabella nel generatore fissa queste eccezioni. Un test controlla che ogni `work` con «, », «: » o « (» abbia la sua voce.
  - «84, Charing Cross Road» mostra che la virgola da sola non basta come regola.

### Il componente

`Quotation` in `@bookeeper/ui/quote` è la composizione del frontespizio del Setup, ora condivisa:

- `figure` con `blockquote` e `figcaption`;
- Lora 500, interlinea 1,24, `text-wrap: balance`, i versi a capo;
- i caporali « » in `--bk-accent-text`, il primo appeso nel margine, tutti e due `aria-hidden`;
- la didascalia in Inter 13 `--bk-text-muted`, l'opera in Lora corsivo 14.

Misura del testo:

- 33 px fino a 90 caratteri, 26 px fino a 140, 22 px oltre. È la scala del Setup.
- Per le poesie si prende il gradino più grande a cui il verso più lungo sta intero nella colonna, scendendo fino a 20 px. Negli schizzi Dickinson in inglese scende a 22 px; con la stima del contratto della 9C, 0,55 em per carattere, scende a 20.
- Alcuni versi non stanno interi nemmeno a 20 px: Dante in tutte e due le lingue, Borges e Dickinson in italiano. Per loro si usano 22 px. Il verso che non sta continua sulla riga sotto, rientrato di 1 em, come nei libri di poesia. Così non sembra un verso nuovo e tutte le citazioni verificate restano nella pagina.
- La larghezza della colonna è un parametro: il Setup la usa larga, la pagina d'apertura a 348 px.

Il `Frontespizio` del Setup usa `Quotation` dentro la sua cornice. La compattazione con FLIP resta del Setup.

### La scelta della citazione

- Per ogni lingua c'è un «mazzo»: tutte le citazioni verificate, in ordine casuale. Si salva in `localStorage`.
- Ogni apertura della pagina prende la carta successiva.
- Quando il mazzo finisce se ne mescola uno nuovo, che non comincia con l'ultima uscita.
- Se `localStorage` non risponde, la citazione si sceglie a caso: la pagina funziona lo stesso.
- La scelta avviene una volta, quando la pagina si apre. Un errore di accesso o il cambio fra le strade non la cambiano.
- Il Setup tiene le sue regole: benvenuto, avanzamento e congedo, con i limiti di lunghezza di oggi. Prende però i dati da qui e salta i testi `null` nella sua lingua.

### La pagina d'apertura

Gli schizzi la mostrano com'è; i valori:

- **Pannello:** largo 440 px come oggi, fondo `--bk-chrome` (chiaro e scuro dai token). Margini 40 sopra, 44 a destra, 36 sotto, 48 a sinistra. La citazione sta in una colonna di 348 px.
- **In alto:** l'icona dell'app (22 px, angoli di 6 px, la stessa del Setup) e «Bookeeper» in Lora 18, 600.
- **Al centro:** la citazione, centrata in verticale nello spazio libero.
- **In fondo:** la promessa di oggi, «Una libreria che resta tua: sul tuo computer, o su un server che scegli tu.», in Inter 13 `--bk-text-muted`, larga al massimo 30ch.
- **Cosa esce:** «I tuoi libri, in ordine.» e le quattro copertine. Le loro chiavi di traduzione si tolgono.
- **Movimento:** all'apertura la citazione entra con `bk-rise` (`--bk-dur-slow`), solo con `prefers-reduced-motion: no-preference`. Poi resta ferma.
- **Accessibilità:** il pannello resta un `aside`, e la citazione si legge come testo. I contrasti sono quelli dei token, già controllati in tutti e due i temi.

## Scelte mie, da controllare

- La promessa di oggi resta in fondo al pannello, in piccolo; il titolo «I tuoi libri, in ordine.» esce.
- L'icona dell'app entra accanto a «Bookeeper», come nel Setup.
- Le didascalie dei pochi casi descrittivi mostrano solo l'autore: nessun testo nuovo scritto da noi.
- I versi troppo lunghi per la colonna continuano rientrati, invece di uscire dalla pagina.
- Se l'ultima citazione del Setup e la prima dell'app coincidono, non conta come ripetizione: capita circa una volta su 60, e per evitarlo bisognerebbe collegare i due programmi.

## Lasciato al costruttore

- La tabella delle didascalie, con il test che la tiene completa.
- Come misurare il verso più lungo: stima a caratteri o misura vera con il font. Per decidere i casi di confine come Dickinson in italiano serve la misura vera.
- I nomi dei file e dei tipi oltre a quelli fissati qui.
