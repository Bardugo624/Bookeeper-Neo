Leggi prima `docs/forge/fase-7b/CONTRATTO.md`, `docs/forge/fase-7b/AUDIT.md`, `PRODUCT.md` e `DESIGN.md`. Leggi `packages/ui/src/tokens.css`, `packages/ui/src/base/base.css`, `packages/ui/src/tokens.test.ts`, i test di stile delle app (`apps/desktop/src/kit/styles.test.ts` e quello della PWA) e la sezione dei colori di `DESIGN.md`.

Prove visive: `/root/.local/state/forge/plans/bookeeper-fase-7b/tasks/ui-tokens/evidenze/` (le pagine con le violazioni di contrasto di `axe`, in entrambi i temi, e `axe.json` di tutte le pagine).

# Kit: token di contrasto e tema scuro (P1)

## Cosa fare

1. **Token semantici** del contratto, in `tokens.css`, con un valore per il tema chiaro e uno per il tema scuro.
2. **Contrasto dei token di testo**: `--bk-text`, `--bk-text-muted`, `--bk-text-faint` e `--bk-accent-text` raggiungono 4,5:1 su `--bk-bg`, `--bk-surface`, `--bk-surface-raised`, `--bk-chrome` e `--bk-inset` del proprio tema. Oggi: `text-faint` chiaro 4,12:1 sulla barra laterale; scuro `text-faint` 2,6:1, `text-muted` 4,39:1, accento 2,89:1. Resta nella stessa famiglia di neutri caldi e di verdi: cambia il gradino, non la tinta.
3. **Bottone principale**: `--bk-primary-fill` è il gradino 600 della scala verde (testo bianco oggi a 4,4:1 sul 500), `--bk-primary-fill-hover` il 700. `Button` e ogni controllo pieno del kit lo usano. È lo stesso verde-salvia, un gradino più scuro: il principio di `PRODUCT.md` lo chiede ("il contrasto del testo non si sacrifica mai all'eleganza").
4. **Superfici d'accento**: `--bk-accent-surface`, `--bk-accent-surface-strong` e `--bk-on-accent-surface` hanno nel tema scuro valori scuri (una tinta verde bassa sul fondo scuro), con il testo sopra ≥ 4,5:1.
5. **Kit**: ogni foglio di stile di `packages/ui/src` usa solo token semantici (fanno eccezione `tokens.css` e i colori dei mobili di `shelf/`, che sono dati). `base.css` imposta `caret-color` e `scrollbar-color` dai token; `accent-color` usa `--bk-accent-control`.
6. **Migrazione delle app**: in ogni foglio di stile di `apps/desktop/src` e `apps/mobile/src` sostituisci i gradini grezzi (`var(--bk-primary-N)`, `var(--bk-neutral-N)`) con il token semantico giusto. Regola: anello del fuoco → `--bk-focus`; fondo tenue d'accento (50) → `--bk-accent-surface`; fondo selezionato o attivo (100, 200) → `--bk-accent-surface-strong`; testo su quei fondi → `--bk-on-accent-surface`; testo, icona o bordo nel colore d'accento (500–800) → `--bk-accent-text` o `--bk-accent-control`; fondo pieno → `--bk-primary-fill`; testo grigio → `--bk-text-muted` o `--bk-text-faint`. Dove la regola non basta, scegli guardando la schermata e scrivilo nel rapporto. Nessun altro cambiamento in quei file.
7. **Guardie**: un test nel kit (`tokens.contrast.test.ts`) legge `tokens.css`, risolve le catene di `var()` per ciascun tema e calcola il contrasto WCAG di ogni coppia del punto 2, di `--bk-on-primary` su `--bk-primary-fill` e sul suo hover, di `--bk-on-accent-surface` sulle due superfici d'accento, del testo dei suggerimenti sul loro fondo. I test di stile delle due app vietano `var(--bk-primary-N)` e `var(--bk-neutral-N)`.
8. **`DESIGN.md`**: la sezione dei colori elenca i token semantici e la regola "mai gradini grezzi nei moduli". Nella sezione del movimento, l'elenco delle eccezioni a `transform` e `opacity` diventa quello vero del codice (P3 dal run 7A). Tra le decisioni del proprietario: il soprattitolo della scheda passa sotto il titolo; i dorsi dei mobili sono un'eccezione dichiarata alla misura minima dei bersagli (la larghezza dice il numero di pagine).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- Cambiano solo: file sotto `packages/ui/src/`, fogli di stile (`*.css`) sotto `apps/desktop/src/` e `apps/mobile/src/`, i test di stile delle due app, `DESIGN.md`.
