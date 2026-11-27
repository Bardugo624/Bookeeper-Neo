Leggi prima `docs/forge/fase-8b1/CONTRATTO.md` e `docs/forge/fase-8b1/request.md`.

# Tour nel pop-up del libro: il titolo resta in vista

Controllo a schermo dopo l'8B, finestra 1024×768, primo libro inserito a mano, passo «Controlla i dati e salva». La scheda del tour sta nello spazio `data-tour-slot`, in fondo al modulo che scorre (`modules/books/BookSheet.tsx`), e `modules/tour/CoachCard.tsx` la porta in vista con `scrollIntoView`. Il modulo scorre fino in fondo e il campo «Titolo», il primo da compilare e quello con il fuoco, esce dalla vista.

Regola:
- La scheda è visibile senza far scorrere il modulo: il corpo del pop-up parte dall'alto, con «Titolo» in vista.
- La scheda non copre mai i bottoni della barra in basso («Annulla», «Salva e aggiungi un altro», «Salva») né il campo con il fuoco.
- Niente `scrollIntoView` per lo spazio della scheda.
- Il kit (`Dialog` di `packages/ui`) NON si tocca. Una strada che funziona: lo spazio resta l'ultimo elemento del modulo, con `position: sticky; bottom: 0` e lo sfondo del pannello, così resta in fondo all'area che scorre. Il contenuto gli scorre sotto, e alla fine del modulo la scheda torna al suo posto. Se scegli un'altra strada, scrivi nel rapporto perché.
- A 1280×800 la scheda resta accanto al pop-up, come oggi.
- `.tourSlot:empty` resta nascosto quando la scheda non c'è.

Pulizia dei test (nota del revisore dell'8B): `modules/tour/coachSlot.test.tsx` ripristina tutto ciò che simula, cioè `Element.prototype.scrollIntoView` se resta, i `vi.stubGlobal` con `vi.unstubAllGlobals()` e il dialogo aggiunto a `document.body`. Aggiungi il test del ripiego quando il dialogo non ha lo spazio: la scheda si mette accanto all'ancora.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/tour src/modules/books src/kit/styles.test.ts` (da `apps/desktop`) passa.
- Test: lo spazio è sticky in fondo (test di stile); nessuno scorrimento chiamato quando la scheda entra nello spazio; il ripiego senza spazio.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo i file dichiarati: `apps/desktop/src/modules/tour/`, `apps/desktop/src/modules/books/BookSheet.tsx`, `apps/desktop/src/modules/books/BookSheet.module.css`.
