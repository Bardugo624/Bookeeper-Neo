---
version: 1
slug: "src-modules-welcome-welcomeview-tsx"
primary_target: "src/modules/welcome/WelcomeView.tsx"
related_targets: ["src/modules/welcome/BrandPanel.tsx"]
---

# Pagina d'apertura dell'app desktop

Modalità: **Operate**. È la prima schermata dell'app: al primo avvio si sceglie come avere una libreria, chi torna rientra con la password. Il pannello di sinistra è il frontespizio del marchio; la parte destra è il compito.

- **Chi:** chi apre Bookeeper sul computer di casa, spesso non tecnico; al primo avvio, o dopo aver chiuso la sessione.
- **Compito:** creare una libreria, unirsi a una che c'è, crearla su un server; oppure rientrare in quella salvata.
- **Vincoli:** il mondo visivo è quello dell'app (`DESIGN.md`) e del frontespizio del Setup; italiano e inglese; tema chiaro e scuro dal sistema; WCAG 2.2 AA; finestra da 1280×800 fino al minimo di 960×600.
- **Momento da ricordare:** la citazione di uno scrittore, diversa a ogni apertura.

## Direction contract

THESIS: La pagina d'apertura è un frontespizio. A sinistra la citazione di uno scrittore composta come la prima pagina di un libro; a destra la strada per entrare, come oggi. Rifiuta il pannello promozionale con slogan e copertine finte.

OWN-WORLD: Pannello su `--bk-chrome`, largo 440 px. Lora per la citazione e il marchio, Inter per il resto. Caporali «» in `--bk-accent-text`, il primo appeso nel margine, come nel Setup. Nessun colore nuovo, nessuna immagine oltre l'icona dell'app.

STORY: Chi apre l'app vede subito una citazione nuova, poi la sceglie o la ignora e fa quello per cui è venuto. Chi torna trova solo «Bentornato in …» a destra, senza la domanda del primo avvio.

FIRST VIEWPORT: Finestra 1280×800. Pannello di 440 px con margini 40, 44, 36 e 48 px. In alto l'icona dell'app (22 px) e «Bookeeper» in Lora 18. Al centro la citazione in Lora 500, colonna di 348 px, 33, 26 o 22 px secondo la lunghezza, con autore e opera sotto (Inter 13, opera in Lora corsivo 14). In fondo la promessa «Una libreria che resta tua…» in Inter 13 `--bk-text-muted`. A destra la colonna di oggi.

FORM: «Pannello della citazione», scelto dal proprietario fra tre strutture: pannello della citazione, frontespizio in alto, promessa più citazione.

SIGNATURE: All'apertura la citazione entra con `bk-rise` (`--bk-dur-slow`), poi resta ferma: niente si muove mentre si scrive. I versi restano versi: quello che non sta nella colonna continua rientrato di 1 em. Con `prefers-reduced-motion` la citazione è subito ferma.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
