Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Zona pericolosa»), `PRODUCT.md` e `DESIGN.md`. La task `kit-dialog-grow` è già unita (il `Dialog` del kit ha `size`, crescita e `origin`).

# Kit: la zona pericolosa

## Perché

Il proprietario vuole che in ogni interfaccia, impostazioni comprese, le operazioni pericolose o irreversibili stiano in una **zona pericolosa** con contorni evidenti e tinte rosse. Questa task dà al kit i pezzi e scrive la regola; le task `danger-account`, `danger-collection` e `danger-mobile` la applicano.

Setup di Impeccable da `packages/ui` con `--target src/base`; leggi `reference/craft-floor.md`. Modalità Operate: evidente, non urlata. Il rosso dice «attenzione», non «errore».

## Cosa fare

1. **`DangerZone`** (`packages/ui/src/base/DangerZone.tsx` e `.module.css`): una sezione (`<section>` con nome dal titolo) con contorno `1px solid var(--bk-danger)`, fondo `var(--bk-danger-bg)`, raggio `--bk-radius`. In alto l'icona `alert` e il titolo (testo passato da chi la usa: il kit non contiene testi), in `--bk-danger-strong`; sotto una riga di descrizione facoltativa. Prop per il livello del titolo (predefinito `h3`).
2. **`DangerAction`**: una riga della zona con titolo, la conseguenza in una frase, e a destra il comando (un `Button variant="danger"` passato da chi la usa). Le righe sono separate da un filetto tinto di rosso. Sotto i 480 px il comando va sotto il testo, a tutta larghezza.
3. **`Dialog` con `tone="danger"`**: contorno `2px` `--bk-danger` sul pannello e l'icona `alert` prima del titolo, in `--bk-danger-strong`. Senza `tone` nulla cambia.
4. `ConfirmDialog` del desktop (`apps/desktop/src/kit/ConfirmDialog.tsx`), quando ha `tone="danger"`, apre il `Dialog` con `tone="danger"`.
5. **`DESIGN.md`**: una sezione «Zona pericolosa» con la regola del contratto (dove va la zona, menu, conferme, quando NON si usa), i due componenti e il tono `danger` dei bottoni leggeri e dei bottoni-icona (lo fa la task `kit-danger-tones`, in parallelo).
6. Esporta `DangerZone` e `DangerAction` da `packages/ui/src/base/index.ts`.

## Test

- `DangerZone` ha ruolo e nome dal titolo; mostra icona, titolo e descrizione; `DangerAction` mostra titolo, conseguenza e comando, e il comando funziona.
- `Dialog` con `tone="danger"` ha la classe del tono e l'icona; senza `tone` è com'era.
- `ConfirmDialog` con `tone="danger"` apre il dialogo col tono.
- I test di stile del kit passano (niente colori letterali, animazioni solo con movimento permesso).

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` e `npm test -w @bookeeper/ui` passano; `npm run typecheck -w @bookeeper/desktop` passa e `npx vitest run src/kit` (da `apps/desktop`) passa.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo: `packages/ui/src/base/DangerZone.tsx`, `DangerZone.module.css`, `DangerZone.test.tsx`, `base/index.ts`; `packages/ui/src/overlays/Dialog.tsx`, `Dialog.module.css`, `Dialog.test.tsx`; `apps/desktop/src/kit/ConfirmDialog.tsx` e il suo test; `DESIGN.md`.
