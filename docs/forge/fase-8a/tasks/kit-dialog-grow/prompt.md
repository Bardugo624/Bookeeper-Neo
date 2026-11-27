Leggi prima `docs/forge/fase-8a/CONTRATTO.md`, `docs/forge/fase-8a/request.md`, `PRODUCT.md` e `DESIGN.md`.

# Kit: il dialogo che cresce e nasce dal pulsante

## Perché

«Nuovo libro» diventa un pop-up al centro dello schermo che si allarga man mano che si compila (task `book-dialog`, dopo questa). Il `Dialog` del kit (`packages/ui/src/overlays/Dialog.tsx`) oggi ha una sola larghezza (480 px) e non anima i cambi di dimensione. Questa task gli dà i tre mezzi che servono. Il `Drawer`, che condivide `DialogPanel`, NON cambia.

## Cosa fare

Setup di Impeccable da `packages/ui` con `--target src/overlays/Dialog.tsx` (vedi il contratto); leggi `reference/animate.md` e `reference/craft-floor.md`.

1. **`size?: 'default' | 'wide'`** su `Dialog`. `default` resta com'è (`min(480px, 100vw - 32px)`); `wide` è `min(760px, 100vw - 32px)`. Se la taglia cambia a dialogo aperto, la larghezza passa con una transizione (`--bk-dur-slow`, `--bk-ease`) e il pannello resta centrato.
2. **L'altezza segue il contenuto con morbidezza.** Quando il contenuto del pannello aperto cresce o cala, il pannello passa dalla vecchia alla nuova altezza con la Web Animations API (`--bk-dur-slow`, `--bk-ease`), restando centrato: si allarga in alto e in basso insieme. Misura con un `ResizeObserver` sul contenuto, non in un ciclo. Il limite `max-height` resta: oltre, scorre il corpo. Senza `ResizeObserver` (jsdom) tutto funziona, senza animazione.
3. **`origin?: HTMLElement | null`**: all'apertura il pannello nasce dal pulsante che l'ha aperto. Parte dal centro di quel pulsante, piccolo e trasparente, e arriva al suo posto in `--bk-dur-slow` con `--bk-ease` (Web Animations su `transform` e `opacity`). Senza `origin` resta l'ingresso di oggi.
4. Con `prefers-reduced-motion: reduce` nulla si muove: niente crescita animata, niente volo dal pulsante; al massimo la dissolvenza esistente.
5. In `DESIGN.md`, nella parte sul movimento, scrivi l'eccezione: la crescita del `Dialog` anima l'altezza del pannello (unica deroga a «solo `transform` e `opacity`»).
6. La logica di movimento sta in un hook nuovo, `packages/ui/src/overlays/useDialogMotion.ts`, perché `Dialog.tsx` resti sotto le 250 righe. Esporta da `index.ts` solo ciò che serve alle app (le nuove prop sono nel tipo `DialogProps`).

## Test

In `Dialog.test.tsx` (e `useDialogMotion.test.ts` se serve), con `matchMedia`, `ResizeObserver` ed `Element.prototype.animate` simulati:
- `size="wide"` dà al pannello la classe larga; il valore predefinito non cambia nulla per chi già usa `Dialog`.
- un cambio d'altezza del contenuto avvia un'animazione dell'altezza dal valore vecchio al nuovo; con il movimento ridotto non ne avvia nessuna;
- con `origin` l'apertura avvia un'animazione che parte dalla posizione del pulsante; senza `origin` o con movimento ridotto no;
- senza `ResizeObserver` e senza `animate` il dialogo si apre, si usa e si chiude come prima (ritorno del fuoco compreso).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` e `npm test -w @bookeeper/ui` passano.
- `npm run typecheck -w @bookeeper/desktop` passa: le app che usano `Dialog` non cambiano.
- `Dialog.tsx` resta sotto le 250 righe; nessun colore o durata letterale nei CSS (solo token).
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo `packages/ui/src/overlays/Dialog.tsx`, `Dialog.module.css`, `Dialog.test.tsx`, `useDialogMotion.ts` (nuovo, con il suo eventuale test), `index.ts` e `DESIGN.md`.
