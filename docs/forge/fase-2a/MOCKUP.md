# Mockup approvati

File Figma: `https://www.figma.com/design/4rKEv5oFvSv0sYkp2HMhEp`. Finestra 1280×820. Solo tema chiaro: il tema scuro deriva dai token.

## Comune a tutte le schermate

- Fondo `--bk-bg`. Nessuna cornice di sistema. In alto a destra tre controlli finestra (riduci, ingrandisci, chiudi), icone da 14px in `--bk-text-faint`. La fascia in alto è trascinabile.
- **Sidebar** larga 224px su `--bk-chrome`, padding 16/12. In alto il marchio "Bookeeper" in Lora SemiBold 18. Sotto, le voci: Libri, Scaffali, Prestiti, Wishlist, Statistiche. In basso: Dispositivi, Impostazioni, poi la riga della libreria (avatar tondo 26px con iniziale su `--bk-primary-100`, nome libreria 12 Medium, "nome · ruolo" 11 in `--bk-text-faint`).
- **Voce attiva**: pillola su `--bk-surface`, raggio 8, `--bk-shadow-1`, icona in `--bk-primary-500`, testo Medium in `--bk-text-strong`. Voce inattiva: icona `--bk-text-faint`, testo `--bk-text-muted`. Mai barre laterali colorate.
- Icone: un solo set a tratto (Lucide), spessore 1,75.
- Titolo di vista: Lora SemiBold 28 in `--bk-text-strong`; sotto, riga di conteggio 13 in `--bk-text-faint`.
- Bottone primario: altezza 38, raggio 8, fondo `--bk-primary-500`, testo bianco 13 Medium. Secondario: fondo `--bk-surface`, bordo `--bk-border-strong`.
- Campo: etichetta 12 Medium in `--bk-text-muted`; casella alta 38, raggio 8, bordo `--bk-border-strong`, fondo `--bk-surface`.

## 01 — Primo avvio

Due colonne. A sinistra, pannello largo 440 su `--bk-chrome`: marchio in alto; al centro "I tuoi libri,\nin ordine." in Lora SemiBold 38 e una riga di testo 14; in basso quattro copertine segnaposto di altezze diverse.

A destra, colonna centrata larga 520: "Come vuoi iniziare?" in Lora SemiBold 26, riga "Puoi cambiare idea più tardi dalle impostazioni.", poi tre schede impilate (raggio 12, fondo `--bk-surface`, bordo `--bk-border`):

1. **Crea qui** — aperta e selezionata: bordo `--bk-primary-500` 1,5px, `--bk-shadow-2`, icona monitor su riquadro 40px `--bk-primary-50`, etichetta "Consigliato". Dentro: due campi affiancati "Nome della libreria" e "Il tuo nome", bottone "Crea la libreria" a destra.
2. **Unisciti** — chiusa: icona catena, testo "Collega questo computer a una libreria che esiste già.", etichetta "1 trovata in rete" con icona wifi quando la scoperta trova qualcosa, freccia a destra.
3. **Crea su un server** — chiusa: icona server, testo "Per raggiungerla anche dal telefono, fuori casa.", freccia a destra.

Una sola scheda è aperta alla volta. La scheda scelta si apre con rise 8px in 200 ms.

## 02 — Libri

Intestazione: titolo "Libri" e conteggio "248 libri · 12 in prestito" a sinistra; a destra campo di ricerca largo 280 con icona lente, segnaposto "Cerca titolo, autore, ISBN" e tasto `Ctrl K`; poi il selettore griglia/lista (due caselle 32px dentro un incasso `--bk-inset`, quella attiva su `--bk-surface`); poi il bottone primario "Aggiungi" (nel run 2A il bottone non esiste).

Sotto, filtri a pillola: Tutti (attivo, fondo `--bk-primary-500`, testo bianco), Da leggere, In lettura, Letti, In prestito, Non collocati, poi "Filtri" con icona imbuto. La pillola attiva scorre da una voce all'altra.

Griglia a sei colonne con finestra da 1280: card larga 144, spazio 24 orizzontale e 28 verticale. Ogni card: copertina 144×216, titolo 13 Medium su una riga con troncamento, autore 12 in `--bk-text-faint`. Etichetta "In prestito" in alto a sinistra sulla copertina. Anello di lettura da 30px in basso a destra sui libri in corso. In coda, una fila di scheletri (rettangoli `--bk-inset`) durante il caricamento.

## 03 — Scaffali (riferimento, non in 2A)

Schede dei mobili con pallino del colore del mobile. Mobile con cornice nel colore scaffale, fondale scuro, tre ripiani, dorsi di larghezza variabile allineati in basso, dorso sollevato al passaggio con tooltip scuro (titolo in grassetto, "autore · pagine"), posti vuoti e posto di rilascio tratteggiato. Pannello a destra: nome, riempimento con barra, elenco "Non collocati".

## 04 — Scheda libro

Barra: "‹ Libri" a sinistra, bottone "Modifica" a destra (nel run 2A il bottone non esiste). Tre colonne, spazio 44:

- **Sinistra, 240px**: `Book3D` con dorso scuro a sinistra, taglio delle pagine a destra, copertina con titolo in Lora SemiBold 26 e autore in corsivo in basso, inclinazione lieve. Sotto, i bottoni "Segna come letto" e "Presta" (non in 2A).
- **Centro**: soprattitolo maiuscolo 11 con spaziatura 8% ("NARRATIVA · 1980"); titolo in Lora SemiBold 38; autore in Lora corsivo 19; etichette; linea; descrizione in Lora 16 con interlinea 27; riga di metadati (Editore, Pagine, Lingua, ISBN) con etichetta 11 e valore 13 Medium.
- **Destra, 232px**: schede con bordo e raggio 12. "Lettura" con `ProgressRing` da 60px, etichetta di stato e pagina; "Dove si trova" con icona segnaposto, mobile, ripiano; "Prestiti".

## Copertine segnaposto

Raggio asimmetrico (dorso 2px, taglio 5px), piega del dorso scura al 4% della larghezza, `--bk-shadow-book`, tinta deterministica dal titolo, iniziale in Lora Medium bianca all'86%.

## Movimento

Durate e curve dai token. Si animano solo `transform` e `opacity`. Con `prefers-reduced-motion: reduce` ogni animazione è spenta e lo stato finale è immediato.

- Pillola scorrevole: molla breve, 200 ms.
- Tooltip: comparsa con rimbalzo breve, 150 ms.
- Copertina al passaggio: `translateY(-3px) rotate(-0.5deg)` e ombra `--bk-shadow-book-lift`.
- `Book3D` al passaggio: rotazione di pochi gradi in prospettiva.
- `ProgressRing`: si riempie in 600 ms al montaggio.
