# Audit Impeccable — app desktop, PWA, kit (26 nov 2026)

Comando: `/impeccable audit apps/desktop/src apps/mobile/src packages/ui/src`, modalità **Operate**. Prove raccolte:

- rilevatore di Impeccable sul codice (`impeccable detect`) delle due app e del kit;
- 98 schermate disegnate (desktop 1280×820, telefono 390×844; temi chiaro e scuro; libreria di famiglia e libreria vuota), ciascuna con `axe-core` 4.14 sulle regole WCAG 2.2 A e AA;
- lettura del codice di token, componenti e moduli dove le prove puntavano.

## Audit Health Score

| # | Dimensione | Punteggio | Rilievo principale |
|---|---|---|---|
| 1 | Accessibilità | 2 | Contrasto sotto AA su 88 pagine; nome accessibile diverso dal testo visibile su 14 |
| 2 | Prestazioni | 3 | Liste a finestra e budget del core rispettati; nessun effetto costoso |
| 3 | Temi | 2 | Tinte d'accento chiare usate come sfondo anche nel tema scuro: stati attivi illeggibili |
| 4 | Responsive | 3 | Nessuno scorrimento orizzontale a 390px; striscia dei filtri rapidi tagliata senza segnale |
| 5 | Integrità dell'implementazione | 3 | Sistema coerente e riconoscibile; una deriva sistemica (gradini grezzi della palette) e un difetto di cache |
| **Totale** | | **13/20** | **Accettabile: serve lavoro mirato** |

## Verdetto sull'integrità dell'implementazione

**Superato.** L'interfaccia esprime un sistema proprio del prodotto: copertine in tela, dorsi che si sfilano, mobili disegnati, palette verde-salvia su neutri caldi, Lora per i titoli dei libri. Le due app usano lo stesso kit (`@bookeeper/ui`), solo token (il test di stile vieta i colori scritti) e nessun componente generico da SaaS. Il rilevatore non trova nulla nel codice delle app; nel kit segnala solo due scelte approvate (il carattere Inter, la curva elastica dei movimenti dei mockup), registrate come eccezioni motivate in `.impeccable/config.json`.

La deriva da correggere è una sola, ma sistemica: dodici fogli di stile usano direttamente `--bk-primary-50` e `--bk-primary-100`, che nel tema scuro restano chiari.

## Riepilogo

- Punteggio: **13/20** (accettabile).
- Rilievi: **P0 1 · P1 3 · P2 6 · P3 2**.
- I più gravi:
  1. la pagina Persone va in errore dopo aver aperto la scheda di un libro (P0);
  2. nel tema scuro gli stati attivi e il blocco "Dove si trova" sono illeggibili (P1);
  3. testo attenuato, scorciatoie e bottone principale sotto 4,5:1 (P1);
  4. nomi accessibili che non contengono il testo visibile (P1).
- Prossimi passi: correggere il P0 e i token del kit, poi un passaggio `polish` e `harden` per gruppo di schermate.

## Rilievi per gravità

### [P0] La pagina Persone va in errore dopo la scheda di un libro
- **Dove**: `apps/desktop/src/modules/people/usePeople.ts`, `books/usePeople.ts`, `loans/useBorrowerSuggestions.ts`.
- **Categoria**: integrità (difetto funzionale).
- **Impatto**: tre moduli usano la stessa chiave di cache `['people', connessione, 'list']`. Persone salva l'array, Libri e Prestiti salvano `{items}`. Se si apre la scheda di un libro o un prestito e poi Persone, la pagina mostra "Qualcosa non ha funzionato" (`query.data.map is not a function`). Riprodotto in entrambi i temi.
- **Raccomandazione**: una sola funzione per l'elenco delle persone, esportata dal modulo Persone e usata dagli altri due; un test che apre la scheda di un libro e poi Persone.
- **Comando**: correzione diretta (non di design).

### [P1] Tema scuro: tinte d'accento chiare usate come sfondo
- **Dove**: dodici fogli di stile, tra cui `settings/SettingsPage.module.css`, `books/FiltersDrawer.module.css`, `books/ActiveFilters.module.css`, `shell/LibraryBadge.module.css`, `welcome/PathCard.module.css`, `onboarding/FirstBookHint.module.css`, `tags/dialogs.module.css`, PWA `search/Blocks.module.css`, `loans/Loans.module.css`, `reading/Reading.module.css`, kit `base/Tag.module.css`, `base/EmptyState.module.css`.
- **Categoria**: temi, accessibilità.
- **Impatto**: nel tema scuro la voce selezionata del menu delle Impostazioni e la scheda attiva dei Prestiti sul telefono hanno testo chiaro su fondo chiaro (1,01:1). Il blocco "Dove si trova" sul telefono è bianco con la frase della posizione bianca. L'icona di "Fotocamera non disponibile" sta in un riquadro bianco.
- **WCAG**: 1.4.3 Contrasto (minimo).
- **Raccomandazione**: token semantici per le superfici d'accento e il loro testo, con valori propri del tema scuro; i componenti usano quelli, mai i gradini grezzi.
- **Comando**: `/impeccable polish` (token e superfici), poi `/impeccable audit` di verifica.

### [P1] Testo attenuato, scorciatoie e bottone principale sotto 4,5:1
- **Dove**: `packages/ui/src/tokens.css` (`--bk-text-faint`, `--bk-text-muted` scuro, testo d'accento scuro, riempimento del bottone principale).
- **Categoria**: accessibilità.
- **Impatto**:
  - chiaro: "Cerca o lancia un comando" a 4,12:1, `Ctrl K` a 4,27:1, testo bianco sul bottone principale `#4d8369` a 4,4:1;
  - scuro: testo attenuato a 2,6:1, `Ctrl K` a 2,33:1, conteggi a 2,7:1, testo secondario a 4,39:1, testo verde d'accento a 2,89:1, etichetta neutra a 4,04:1.
- **WCAG**: 1.4.3 Contrasto (minimo).
- **Raccomandazione**: valori dei token che raggiungono 4,5:1 su ogni superficie del proprio tema (sfondo, superficie, superficie rialzata, barra laterale, incasso). Bottone principale: riempimento sul gradino 600 della stessa scala verde. Il principio di `PRODUCT.md` lo chiede già: "il contrasto del testo non si sacrifica mai all'eleganza".
- **Comando**: `/impeccable polish` sul kit.

### [P1] Nome accessibile diverso dal testo visibile
- **Dove**: card dei libri (desktop), nome della persona nei prestiti ("Mostra i prestiti di Marco" contro "A Marco"), priorità della wishlist, righe della ricerca (PWA).
- **Categoria**: accessibilità.
- **Impatto**: chi usa il controllo vocale pronuncia ciò che vede e il comando non viene riconosciuto.
- **WCAG**: 2.5.3 Etichetta nel nome.
- **Raccomandazione**: il nome accessibile comincia con il testo visibile; ciò che si aggiunge va dopo.
- **Comando**: `/impeccable harden` nei gruppi interessati.

### [P2] Dove si trova: frase spezzata male
- **Dove**: PWA, blocco "Dove si trova" (e ogni punto che usa la frase della posizione).
- **Categoria**: responsive.
- **Impatto**: "Libreria grande · ripiano 1 · posto" va a capo e lascia "1" da solo sulla riga dopo.
- **Raccomandazione**: spazi non divisibili tra l'etichetta e il numero; `text-wrap: pretty` sulla frase.
- **Comando**: `/impeccable polish`.

### [P2] Dorsi più stretti di 24px
- **Dove**: Scaffali (desktop), "Dov'è?" e mobile in sola lettura (PWA).
- **Categoria**: accessibilità.
- **Impatto**: i dorsi sono larghi 12–21px. La larghezza dice il numero di pagine: è un'informazione, quindi la presentazione è essenziale (eccezione di 2.5.8).
- **Raccomandazione**: desktop, eccezione dichiarata in `DESIGN.md`. Telefono: sotto il mobile, l'elenco dei libri per ripiano con righe da 44px, che è il controllo equivalente.
- **Comando**: `/impeccable adapt` sulla pagina del mobile.

### [P2] Filtri rapidi della PWA tagliati senza segnale
- **Dove**: PWA, ricerca.
- **Impatto**: la striscia scorre in orizzontale, ma "Non collocati" appare troncato sotto "Filtri" senza un segnale che c'è altro.
- **Raccomandazione**: sfumatura al bordo della striscia quando c'è altro da scorrere.
- **Comando**: `/impeccable polish`.

### [P2] Soprattitolo sopra il titolo della scheda
- **Dove**: scheda del libro, desktop ("NARRATIVA · 1980").
- **Impatto**: Impeccable vieta sempre l'occhiello sopra un titolo; il mockup approvato lo prevede.
- **Decisione del proprietario (26 nov 2026)**: genere e anno passano sotto il titolo, nella riga dei metadati dopo l'autore, in testo normale.

### [P2] Cursore, barre di scorrimento e caselle di spunta
- **Dove**: `packages/ui/src/base/base.css` (la selezione è già tematizzata) e i moduli che impostano `accent-color` con gradini grezzi.
- **Impatto**: cursore del testo e barre di scorrimento restano quelli del browser; `accent-color` usa `--bk-primary-500/600` anche nel tema scuro.
- **Raccomandazione**: `caret-color`, `scrollbar-color` e un `accent-color` semantico nel kit, dai token del tema.
- **Comando**: `/impeccable polish` sul kit.

### [P2] Coerenza dei vuoti e degli errori
- **Dove**: stati vuoti e d'errore delle due app.
- **Impatto**: alcuni stati vuoti spiegano e offrono l'azione (Libri, Scaffali), altri solo il titolo; gli errori dicono "Qualcosa non ha funzionato" senza dire cosa.
- **Comando**: `/impeccable harden` e `/impeccable clarify` per gruppo.

### [P3] Commento che cita un file eliminato; test dei piani di query che non copre `/stats`
- Dal run 7A: `crates/bookeeper-core/src/lookup/annas.rs:3` e `crates/bookeeper-core/tests/perf_10k.rs`.

### [P3] `DESIGN.md` elenca una sola eccezione al movimento di `transform` e `opacity`
- Il codice ne ha altre. `DESIGN.md` è il contesto che Impeccable legge: va allineato.

## Problemi sistemici

- I token semantici coprono testo, superfici e stati, ma non le superfici d'accento: i moduli hanno ripiegato sui gradini grezzi della palette, che il tema scuro non cambia.
- I token di testo attenuato sono stati scelti per l'aspetto, non misurati: nessun test controlla il contrasto delle coppie testo-superficie.

## Cosa funziona

- Mondo visivo coerente e proprio del prodotto, applicato a entrambe le app.
- Solo token nei fogli di stile, sorvegliati da un test.
- Stati vuoti presenti quasi ovunque, con l'azione successiva.
- Movimento ridotto rispettato; fuoco visibile; navigazione da tastiera provata dai test.
- Nessuno scorrimento orizzontale sul telefono; bersagli da 44px.
- Prestazioni con 10.000 libri dentro il budget.

## Azioni raccomandate

1. **[P0]** correzione diretta: elenco delle persone con una sola forma di dati.
2. **[P1] `/impeccable polish` sul kit**: token semantici per le superfici d'accento, contrasto dei token di testo e del bottone principale, cursore, barre e `accent-color`, test del contrasto.
3. **[P1] `/impeccable polish` e `/impeccable harden` per gruppo di schermate**: passaggio ai token semantici, etichette nel nome, poi (P2) frase della posizione, striscia dei filtri, stati vuoti ed errori.
4. **[P2] `/impeccable adapt`** sulla pagina del mobile della PWA: elenco equivalente dei libri.
5. Verifica finale: `/impeccable audit` sulle stesse 98 schermate.

Rapporto salvato solo nel repository: il salvataggio sul servizio di Impeccable non è stato usato.
