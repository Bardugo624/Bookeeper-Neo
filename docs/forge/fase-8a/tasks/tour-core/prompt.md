Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Il tour»), `docs/forge/fase-8a/request.md`, `PRODUCT.md` e `DESIGN.md`.

# Desktop: il motore del tour del primo accesso

## Cosa

Il proprietario ha scelto la direzione «Primo libro dal vivo»: un tour interattivo sui dati veri, con un riflettore che illumina ciò che la persona deve usare e una scheda che dice cosa fare. Questa task costruisce **il motore**, senza i percorsi veri: quelli arrivano con le task `tour-start`, `tour-place-pair` e `tour-explore`, che lo usano. Tutto sta nel modulo nuovo `apps/desktop/src/modules/tour/`.

Setup di Impeccable da `apps/desktop` con `--target src/modules/tour`; leggi `reference/overdrive.md`, `reference/onboard.md`, `reference/animate.md` e `reference/craft-floor.md`. Qui l'ambizione è giusta: è il momento d'impatto del primo accesso. Ma resta un'app: niente coriandoli, niente toni da giocattolo.

## Il modello (`model.ts`, `storage.ts`)

- Un **percorso** è una lista di al massimo 3 **passi**. Un passo ha: un id; titolo e testo (chiavi i18n, con parametri); il bersaglio da illuminare, cioè l'id di un'**ancora** oppure una funzione dello stato che lo sceglie (un passo può guidare in più punti, come «vai agli Scaffali» e poi «Nuovo mobile»); il **segnale** che lo completa.
- Stati: `idle`, `running` (passo n), `paused` (passo n), `done`, `skipped`. Avanti solo con il segnale del passo; «Lo faccio dopo» mette in pausa; «Salta il tutorial» chiude per sempre.
- Si ricorda per connessione in `localStorage` (`bookeeper.tour.<connectionId>`: percorso, passo, stato) dentro `try/catch`. Un flag `bookeeper.tour.pending.<connectionId>` dice «questa persona è nuova»: le task successive lo scrivono e lo leggono con le funzioni che esporti qui.

## L'API (`store.ts`, `routes.tsx`, `index.ts`)

- Lo stato sta in uno store come quello della sessione (`apps/desktop/src/session/store.ts`): NON in un provider alla radice, perché `app/AppProviders.tsx` sta fuori dal router.
- Il riflettore e la scheda si registrano come `overlay` del modulo in `modules/tour/routes.tsx` (`AppModule.overlay`, `app/types.ts`), come fa la palette (`modules/palette/routes.tsx`): i moduli si raccolgono da soli (`app/modules.ts`).
- `useTour()` dà: `start(percorso)`, `pause()`, `resume()`, `skip()`, lo stato e il passo corrente. `tourSignal(nome, dati?)` si chiama da qualunque modulo in qualunque momento: se il tour non aspetta quel segnale non succede nulla.
- `tourAnchor(id)` dà le prop da mettere su un elemento perché il tour lo trovi (per esempio `data-tour="books.add"`).

## Il riflettore (`Spotlight.tsx`) e la scheda (`CoachCard.tsx`)

- **Riflettore**: uno strato fisso sopra l'app che scurisce tutto tranne un rettangolo arrotondato attorno all'ancora, con un margine; l'ombra è calda (token `--bk-scrim` con trasparenza, come gli altri veli), come una lampada da lettura. Lo strato NON intercetta i clic: il bersaglio e il resto dell'app restano usabili. Un `pointerdown` fuori dal bersaglio e dalla scheda mette il tour in pausa.
- Quando il passo cambia bersaglio, il rettangolo **scivola** al nuovo posto (al massimo 450 ms, `--bk-ease`). Segue l'ancora se la finestra cambia misura, se la pagina scorre o se l'ancora si sposta (`ResizeObserver` più ascolto di resize e scroll, al massimo una misura per frame). Se l'ancora non c'è (un'altra pagina), il riflettore sparisce e la scheda resta, con il testo del passo.
- **Scheda**: accanto al bersaglio, dal lato dove c'è spazio, con una freccia. Contiene l'avanzamento come piccoli segnalibri (uno per passo: fatto, corrente, da fare; non solo per colore), il titolo in serif, una o due frasi, e le azioni «Lo faccio dopo» e «Salta il tutorial». È una regione (`role="region"`, nome dal titolo), NON un `dialog` (vedi il contratto); il cambio di passo è annunciato in `aria-live="polite"`. Esc mette in pausa. Il fuoco resta dov'è: la scheda non lo ruba al bersaglio.
- **Dentro un dialogo.** Se l'ancora sta in un dialogo modale aperto (Radix), la scheda si disegna dentro quel dialogo (portale nel suo contenuto): resta cliccabile e un clic su di lei non chiude il dialogo. Il riflettore resta fuori: non riceve clic.
- Con il movimento ridotto il rettangolo salta al nuovo posto senza scivolare.

## «Primi passi» (`FirstStepsPill.tsx`)

Componente piccolo per la barra laterale (lo monta `tour-start`): visibile quando il tour è in pausa; mostra «Primi passi» e l'avanzamento (per esempio un anello con 1 di 3); un clic riprende il tour; un menu offre «Non mostrare più» (= salta). Sparisce quando il tour è finito o saltato.

## Testi

Namespace nuovo `tour`: basta creare `packages/i18n/src/locales/it/tour.json` e `en/tour.json` (`packages/i18n/src/index.ts` li carica da solo; `i18n.test.ts` vuole le stesse chiavi nelle due lingue). Dentro: le azioni (Lo faccio dopo, Salta il tutorial, Riprendi, Non mostrare più), «Primi passi», l'avanzamento («Passo {n} di {total}»), l'annuncio del passo.

## Test

`tour.test.tsx` (e altri file accanto ai componenti, se serve), con un percorso di prova definito nel test:
- jsdom non ha `matchMedia` né `ResizeObserver`: simulali nei test.
- `start` illumina l'ancora del primo passo; il segnale giusto passa al successivo, uno sbagliato non fa nulla; l'ultimo porta a `done`;
- «Lo faccio dopo», Esc e un clic fuori mettono in pausa; «Primi passi» riprende dal passo giusto; «Non mostrare più» e «Salta il tutorial» portano a `skipped` e non torna più;
- stato e passo sopravvivono a un nuovo montaggio (stessa connessione) e sono separati per connessione; senza `localStorage` nulla si rompe;
- la scheda ha ruolo e nome, i segnalibri hanno un testo per lo stato, l'annuncio cambia con il passo;
- il riflettore non intercetta i clic (il bersaglio riceve il clic) e con il movimento ridotto non anima.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/tour` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Ogni componente sotto le 250 righe; nessun testo nei componenti; nessun colore letterale (solo token semantici).
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo `apps/desktop/src/modules/tour/` (nuovo), i file `tour.json` (it, en).
