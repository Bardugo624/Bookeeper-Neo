Leggi prima `docs/forge/fase-8a/CONTRATTO.md`, `docs/forge/fase-8a/request.md`, `PRODUCT.md` e `DESIGN.md`. Le task `kit-dialog-grow` e `book-dialog` sono già unite: «Nuovo libro» è il pop-up centrato `BookDialog` (`apps/desktop/src/modules/books/`), con la copertina a sinistra nella scheda.

# Desktop: la copertina vola al suo posto

## Cosa

Quando si salva un libro nuovo con «Salva», il pop-up si chiude e la copertina **vola** dal pop-up al posto del libro nella griglia dei Libri: si capisce dove è finito il libro appena aggiunto. È il momento che il tour del primo accesso usa per il primo libro (task successive), ma vale per ogni libro nuovo.

## Come

Setup di Impeccable da `apps/desktop` con `--target src/modules/books/BookGrid.tsx`; leggi `reference/animate.md`, `reference/overdrive.md` e `reference/craft-floor.md`.

1. Al salvataggio il pop-up consegna a chi l'ha aperto la posizione e l'immagine della copertina che mostrava (copertina scelta, oppure il blocco col colore del dorso quando non c'è immagine).
2. Quando la scheda del nuovo libro compare nella griglia, una copia della copertina parte dalla posizione del pop-up e arriva a quella della scheda: posizione e dimensione con `transform` (Web Animations), al massimo 450 ms con `--bk-ease`; all'arrivo la copia scompare e resta la copertina vera, senza salti.
3. Se la scheda non è visibile (vista a tabella, filtri che nascondono il libro, libro fuori dalla parte di elenco caricata), la copia scorre via con una dissolvenza breve e la pagina NON scorre da sola.
4. «Salva e aggiungi un altro» non fa volare nulla: il pop-up resta aperto.
5. Con `prefers-reduced-motion: reduce` nessun volo. Se le View Transitions mancano, si usa la copia animata: è il percorso normale, non un ripiego.
6. Il volo non blocca nulla: la griglia si usa subito, e un secondo salvataggio durante il volo lo interrompe in modo pulito.
7. Per trovare la scheda di un libro usa un attributo stabile (per esempio `data-book-cover="<id>"`) sulla copertina della scheda in `BookCard`.

## Test

Con `getBoundingClientRect` ed `Element.prototype.animate` simulati, come i test esistenti:
- dopo «Salva» su un libro nuovo parte un'animazione dalla posizione del pop-up a quella della scheda del libro creato;
- con «Salva e aggiungi un altro», con il movimento ridotto, o con la scheda assente (vista tabella) nessun volo verso la griglia;
- la copia viene tolta dal documento alla fine dell'animazione e se il componente si smonta prima.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/books` (da `apps/desktop`) passa.
- Nessun componente oltre 250 righe (la logica del volo sta in un hook, per esempio `useCoverFlight.ts`); nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo file sotto `apps/desktop/src/modules/books/`.
