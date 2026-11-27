---
version: 1
slug: "src-main-tsx"
primary_target: "src/main.tsx"
related_targets: []
---

# Bookeeper Setup (Windows)

Modalità: **Operate**. Una mini-app Tauri di 800×520, senza cornice, che installa, aggiorna, ripara e disinstalla Bookeeper. Dietro lavora in silenzio l'installer NSIS dell'app.

- **Chi:** chi scarica Bookeeper su un PC di casa, spesso non tecnico.
- **Compito:** installare con un tasto, oppure scegliere cartella, icone (desktop, Start) e apertura all'accesso a Windows; aggiornare o riparare; disinstallare scegliendo se tenere la libreria.
- **Vincoli:** il mondo visivo è quello dell'app (`DESIGN.md`), senza eccezioni; italiano e inglese; tema chiaro e scuro dal sistema; WCAG 2.2 AA; mai permessi di amministratore.
- **Momento da ricordare:** la citazione che cambia mentre Bookeeper si installa.
- **Aperto:** le citazioni definitive dipendono dalle scelte del proprietario su `docs/citazioni`.

## Direction contract

THESIS: Il Setup è un frontespizio. In alto una pagina con la citazione di uno scrittore, sotto un solo pannello di lavoro. Rifiuta la procedura guidata classica: niente barra dei passi, niente «Avanti» e «Indietro».

OWN-WORLD: Frontespizio su `--bk-chrome`, pannello su `--bk-surface` con filetto `--bk-border`. Lora per citazione e titoli, Inter per il resto. Caporali «» in `--bk-accent-text`, il primo appeso nel margine. Un solo bottone pieno salvia per schermata. `FillBar` in accento, caselle native con `role="switch"` come nell'app, icone Lucide a 1,75.

STORY: Chi apre vede cosa installa, dove e con quali icone, e installa con un tasto. «Personalizza» fa salire il pannello con cartella, icone e apertura all'accesso. Quando parte l'installazione la citazione cambia, poi al massimo ogni 6 secondi; alla fine c'è «Apri Bookeeper». Il disinstallatore usa lo stesso frontespizio: «Tieni la libreria» è già scelto, «Cancella tutto» chiede la conferma rossa.

FIRST VIEWPORT: Finestra 800×520. Barra del titolo di 36px: icona e «Bookeeper» (Lora 15) a sinistra, riduci e chiudi a destra. Frontespizio di 304px: citazione in Lora 500 a circa 33px, margine sinistro 72px, attribuzione a 13px con l'opera in corsivo. Pannello di 180px: «Installa Bookeeper» (Lora 20), versione e peso, riassunto di cartella e icone; a destra «Personalizza» (secondario) e «Installa» (pieno).

FORM: «La citazione», posizione 6 nel mio elenco ordinato; seed:fc1a345b33f3852f.

SIGNATURE: Per le scelte il pannello sale con `translateY` (`--bk-dur-slow` `--bk-ease`), riassunto e modulo si scambiano in dissolvenza, e la citazione si compatta con la tecnica FLIP (`scale` e `translate`): solo `transform` e `opacity`, come vuole `DESIGN.md`. La citazione nuova entra con `bk-rise`. Con `prefers-reduced-motion` ogni cambio è immediato.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
