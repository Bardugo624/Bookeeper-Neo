# Contratto del run 8A

Valgono per intero i contratti delle app (`docs/forge/fase-2a`, `fase-2b`, `fase-2c`, `fase-3a`, `fase-4b`, `fase-4c`, `fase-5a`, `fase-6b`, `fase-7b`), `PRODUCT.md` e `DESIGN.md`. La richiesta e le decisioni del proprietario sono in `docs/forge/fase-8a/request.md`. Qui ci sono solo le aggiunte.

## Impeccable

- Le task dell'interfaccia usano la skill Impeccable, in `.claude/skills/impeccable/`. Modalità **Operate**: sono schermate di un'app.
- Setup: dalla cartella dell'app (`apps/desktop` o `packages/ui`) esegui `../../.claude/skills/impeccable/scripts/impeccable context --target <file principale della task>`. Se non parte, segui la sezione "Launcher unavailable" della skill: leggi `PRODUCT.md` e `DESIGN.md`.
- Prima di ogni modifica all'interfaccia leggi `reference/craft-floor.md`. Le task del pop-up seguono anche `reference/layout.md` e `reference/animate.md`; quelle del tour `reference/overdrive.md` e `reference/onboard.md`.
- La direzione è già scelta dal proprietario. NON proporre alternative e NON fare domande: dove la skill chiederebbe, decidi secondo questa consegna, `PRODUCT.md` e `DESIGN.md`, e scrivi nel rapporto cosa hai deciso.
- Alla fine, sui file cambiati: `.claude/skills/impeccable/scripts/impeccable detect --json <file>` non trova nulla, a parte le eccezioni di `.impeccable/config.json`.
- Il salvataggio dei rapporti sul servizio di Impeccable NON si usa.

## Decisioni approvate (non si toccano)

Palette verde-salvia e neutri caldi; i caratteri di `packages/ui/src/fonts.css` (serif per i titoli, sans per l'interfaccia); le curve dei movimenti approvati (`--bk-ease`, `--bk-ease-spring`); libro 3D; anello di lettura; dorso che si sfila; il titolo «Popola la tua libreria». I token semantici di colore restano quelli del 7B: nei moduli NON si usano i gradini grezzi della palette.

## Movimento

- Cambi di stato dell'interfaccia: 150–250 ms, con i token `--bk-dur-*`. Il riflettore del tour che si sposta e la copertina che vola: al massimo 450 ms. Nessuna sequenza orchestrata al caricamento.
- Con `prefers-reduced-motion: reduce` nulla si muove: al massimo una dissolvenza di 150 ms. Ogni animazione ha un esito senza animazione identico nello stato finale.
- Si animano `transform` e `opacity`; la crescita del pop-up si anima misurando l'altezza (Web Animations API), senza misure ripetute in un ciclo. Obiettivo 60 fps.
- Nessuna dipendenza nuova: niente librerie di tour o di animazione. Solo API del browser: Web Animations, `ResizeObserver`, e le View Transitions solo con un ripiego che fa lo stesso senza di loro. L'app gira su WebView2, WKWebView e WebKitGTK.

## Il tour (task `tour-core`, `tour-first-book`, `tour-explore`)

- **Sui dati veri.** Ogni passo si completa quando la persona fa l'azione reale. L'interfaccia resta usabile: il riflettore non blocca mai il clic sul bersaglio; un clic altrove mette il tour in pausa in «Primi passi», non lo impedisce.
- **Mai fastidioso.** «Salta il tutorial» sempre visibile; ogni passo si rimanda; si riprende da «Primi passi»; finito o saltato non torna più; si rivede dalle Impostazioni. Al massimo 3 passi per percorso.
- **Chi lo vede.** Ogni nuova persona, al primo accesso: subito dopo aver creato una libreria (sul computer o su un server) o dopo essere entrata con un invito. NON dopo l'abbinamento di un dispositivo di una persona che esiste già; NON per chi usava l'app prima di questa versione.
- **Dove si ricorda.** `localStorage` con la chiave per connessione (come `bookeeper.onboarding.firstBook.<connectionId>`), sempre dentro `try/catch`: senza storage il tour semplicemente non si ricorda.
- **Accessibilità.** La scheda del tour è un dialogo non modale (`role="dialog"` senza `aria-modal`, con nome dal suo titolo) ed è annunciata con garbo. Esc mette in pausa. Il fuoco non viene tolto al bersaglio che il passo chiede di usare. Tutto si fa da tastiera. Contrasti a norma nei due temi.
- **Testi.** In `packages/i18n`, italiano e inglese. Frasi brevi, seconda persona singolare, niente punti esclamativi, niente gergo tecnico.

## Regole

- Nessuna modifica al core, a `packages/api`, agli script di build, a `ops/`.
- Ogni task tocca solo i file dichiarati. Da un altro modulo si importa solo ciò che esporta dal suo `index.ts`.
- Regole di sempre: nessun componente oltre 250 righe; nessun testo nei componenti; nessuna chiamata al client dentro un componente; nessun colore letterale; nomi dei file di test con le stesse maiuscole del file che provano.
- WCAG 2.2 AA: testo ≥ 4,5:1; componenti e indicatori ≥ 3:1; bersagli ≥ 24×24 px; fuoco sempre visibile; nessuna informazione affidata al solo colore.
- Ogni comportamento ha un test. jsdom non ha layout: si provano stato, ruoli, nomi accessibili, persistenza e segnali; la geometria con `getBoundingClientRect` simulato, come fanno i test esistenti.
