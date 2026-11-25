Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# UI: dialog, menu, schede scorrevoli, toast, tooltip

## Obiettivo

Consegnare `@bookeeper/ui/overlays`. La task `ui-base` è già unita: usa i suoi componenti e i suoi token, e NON aggiungere dipendenze (`radix-ui` è già installato).

## Cosa fare

Tutto sotto `packages/ui/src/overlays/`, un componente per file con il proprio `.module.css`, più `index.ts`.

- **`Dialog`** e **`Drawer`** su Radix Dialog. `title` obbligatorio (intestazione in Lora), `description` facoltativa, corpo, piede con azioni. Sfondo `--bk-surface-raised`, raggio `--bk-radius-lg`, `--bk-shadow-3`, velo scuro. `Drawer` entra da destra, largo 420. Ingresso: fade e rise 8px, `--bk-dur-slow`.
- **`Menu`** su Radix DropdownMenu: voci con icona facoltativa, voce pericolosa in `--bk-danger`, separatore.
- **`Select`** su Radix Select, con l'aspetto di `Input`.
- **`PillTabs`** secondo il contratto. Un solo elemento indicatore, posizionato in assoluto, che si sposta e si ridimensiona con `transform: translateX() scaleX()` (o `translateX` più larghezza in variabile CSS impostata senza animarla): misura la scheda attiva con `ResizeObserver` e al cambio di `value`. Variante `pill` (filtri del mockup Libri: attiva su `--bk-primary-500` con testo bianco, le altre con bordo) e `segmented` (selettore griglia/lista: incasso `--bk-inset`, attiva su `--bk-surface`). `dot` è un colore: pallino 9px prima dell'etichetta (schede dei mobili). Tastiera: frecce sinistra/destra, Home, End; una sola scheda nel giro di tabulazione.
- **`ToastProvider`** e **`useToast`**: pila in basso a destra, al più 3 visibili, chiusura automatica dopo 5 secondi (sospesa al passaggio e al fuoco), bottone di chiusura con nome accessibile. `tone`: `neutral`, `ok`, `warn`, `danger`. Regione `aria-live="polite"`; `danger` usa `assertive`.
- **`Tooltip`** su Radix Tooltip: fondo `--bk-tooltip-bg`, testo `--bk-tooltip-text`, raggio 8, freccia. Comparsa `scale(0.92) → 1` con `--bk-ease-spring` in `--bk-dur-fast`. `content` accetta un nodo: serve per "titolo in grassetto + riga secondaria".

Nessun `z-index` scritto a mano: usa i token `--bk-z-*`.

## Test

Un file di test per componente. `@testing-library/user-event` per tastiera e puntatore. Almeno:

- `Dialog`: si apre, il fuoco entra, Esc chiude e il fuoco torna al bottone che l'ha aperto; ha `role="dialog"` con nome uguale a `title`.
- `Drawer`: come sopra.
- `Menu`: si apre con Invio, frecce muovono il fuoco, Invio sceglie e chiama il gestore una volta.
- `Select`: scelta da tastiera aggiorna il valore mostrato e chiama `onValueChange`.
- `PillTabs`: ruoli `tablist`/`tab`, `aria-selected`; freccia destra dall'ultima torna alla prima; Home ed End; clic chiama `onChange` con l'id; esiste un solo indicatore nel DOM qualunque sia il numero di schede; le due varianti hanno lo stesso comportamento.
- `Toast`: `useToast().show(...)` mostra il titolo in una regione `status`; `danger` in `alert`; con timer finti sparisce dopo 5 secondi; quattro toast: tre visibili.
- `Tooltip`: compare al fuoco da tastiera e il contenuto è collegato con `aria-describedby`.
- Il test di stile della task `ui-base` (nessun colore scritto, animazioni solo dentro `prefers-reduced-motion: no-preference`) vale anche per `src/overlays`: aggiungine uno uguale in questa cartella.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` e `npm test -w @bookeeper/ui` passano.
- `import { Dialog, Drawer, Menu, Select, PillTabs, ToastProvider, useToast, Tooltip } from '@bookeeper/ui/overlays'` compila da un file di test.
- Nessun componente supera 250 righe.
- `git diff --stat` rispetto alla base tocca solo file sotto `packages/ui/src/overlays/`.
