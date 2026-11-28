---
version: 1
slug: "src-modules-reader-readerview-tsx"
primary_target: "src/modules/reader/ReaderView.tsx"
related_targets: ["../../packages/reader/src/Reader.tsx", "../mobile/src/modules/reader/ReaderScreen.tsx"]
---

# Lettore di e-book

Modalità: **Operate**. È la vista a tutto schermo in cui si legge un libro caricato, sul computer e sul telefono. Lo stesso codice sta in `packages/reader`; le due app lo montano. La specifica è in `docs/superpowers/specs/2026-11-28-lettore-design.md`, gli stati disegnati in `docs/superpowers/specs/2026-11-28-lettore/`.

- **Chi:** chi in famiglia legge un e-book, la sera, a lungo: sul computer di casa o sul telefono, anche senza rete.
- **Compito:** leggere senza distrazioni; ritrovare il punto; prendere e ritrovare note; regolare la pagina.
- **Vincoli:** il mondo visivo è quello dell'app (`DESIGN.md`); italiano e inglese; quattro temi di lettura più «Auto»; WCAG 2.2 AA in ogni tema, anche sul testo evidenziato; finestra da 1280×800 fino a 960×600; telefono da 375 px, con le aree sicure; nessun ritardo percepibile nel girare pagina.
- **Momento da ricordare:** il libro resta solo sulla pagina; e la posizione non salta mai: ogni salto lascia «Torna al 4%».

## Direction contract

THESIS: Il lettore è la pagina. Mentre leggi ci sono solo il testo e una linea sottile in fondo; al tocco tornano la barra in alto, l'avanzamento con i capitoli e, a richiesta, il pannello compagno a destra con Indice, Note e Cerca. Rifiuta il cruscotto pieno di icone e il lettore che decide da solo dove sei.

OWN-WORLD: Il mondo dell'app, senza colori nuovi. I temi di lettura vengono dai neutri caldi (chiaro e scuro), dall'ambra dei mobili (seppia) e dal nero pieno (nero); i controlli prendono le superfici del tema scelto, così una pagina scura non ha mai una barra bianca. Il testo usa il carattere dell'editore; se manca, Lora. I controlli sono in Inter e vengono dal kit: `IconButton`, `PillTabs`, `Tooltip`, `Menu`, `Button`. Le evidenziazioni hanno i colori dei mobili di casa (ambra, salvia, terracotta, notte), velati sul testo. La selezione resta quella del sistema, così non si confonde con un'evidenziazione. Niente vetro, niente ombre sul testo, nessuna icona senza nome accessibile.

STORY: Chi apre un libro lo trova dove l'aveva lasciato su quel dispositivo, con i controlli visibili. Se un altro dispositivo è più avanti, la barra in basso lo chiede e aspetta: «Continua da dove eri sul telefono?». Alla prima pagina girata i controlli spariscono; tornano col tocco al centro, col mouse vicino al bordo alto o basso, o con Esc. Le note si prendono selezionando il testo; si ritrovano nel pannello, si esportano in Markdown. In fondo al libro la barra chiede se segnarlo come letto.

FIRST VIEWPORT: Finestra 1280×800, controlli visibili, pannello chiuso. Barra in alto di 52 px sulla superficie del tema: «Indietro» a sinistra; al centro il titolo (Inter 14, 500) e «· Capitolo I» in `--bk-text-muted`; a destra Cerca, Segnalibro, Aspetto e Pannello (`IconButton` 36 px). Due pagine di testo, 18 px con interlinea 1,6, margini laterali 96 px e 80 px fra le colonne. In basso 56 px: la barra di avanzamento (6 px) con le tacche dei capitoli, poi «4% · 9 min alla fine del capitolo · 11 h 20 min al libro» in Inter 13 `tabular-nums`. Mentre leggi le due barre se ne vanno e resta una linea di 2 px.

FORM: «Pannello compagno», scelto dal proprietario fra tre strutture: pannello compagno, barra del tempo, binario nel margine. seed: seed:ef54b41f3ca44735; scelta: «Pannello compagno» (la struttura del tiro).

SIGNATURE: La pagina gira scorrendo di lato e segue il dito (`--bk-dur` `--bk-ease`); con `prefers-reduced-motion` cambia di colpo. I controlli entrano ed escono con opacità e 4 px di spostamento, le uscite più brevi delle entrate. Ogni salto (indice, nota, ricerca, barra, «Vai al 45%») lascia nella barra in basso «Torna al 4%». Le domande del lettore («Continua da …», «Segna come letto») stanno nella barra in basso, mai sopra il testo.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
