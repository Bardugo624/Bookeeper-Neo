Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# UI: fondamenta, icone e componenti di base

## Obiettivo

Portare `packages/ui` da "solo token" a libreria di componenti React, e consegnare i componenti di base. Le task `ui-overlays` e `ui-book` partono da qui e NON possono aggiungere dipendenze: installa tu tutto ciò che il contratto elenca.

## Cosa fare

1. **Pacchetto.** `packages/ui/package.json`: `exports` del contratto, `peerDependencies` `react` e `react-dom` `^19`, dipendenze `radix-ui` e `lucide-react`, dipendenze di sviluppo del contratto. `npm install` dalla radice per aggiornare `package-lock.json`. `tsconfig.json`: `jsx: react-jsx`, tipi `vite/client` e `node`. `vitest.config.ts`: plugin React, ambiente `jsdom`, `src/test-setup.ts` (jest-dom e `cleanup`), CSS Modules attivi con nomi di classe stabili nei test. `src/css.d.ts` dichiara `*.module.css`.
2. **Cartelle future.** Le voci `./overlays` e `./book` in `exports` puntano a file che arrivano con le altre task: non crearli. `npm run typecheck -w @bookeeper/ui` DEVE passare lo stesso (nessun import verso quelle cartelle).
3. **Token.** Aggiungi a `tokens.css` i token del contratto, in chiaro e in scuro. Non cambiare i valori esistenti. Estendi `tokens.test.ts` perché controlli i token nuovi in entrambi i temi.
4. **`src/base/`.** `base.css` e i componenti del contratto, uno per file con il proprio `.module.css`, più `index.ts`. Aspetto da `MOCKUP.md` (bottone alto 38 con raggio 8, campo alto 38, etichette). `Icon` espone un tipo `IconName` con almeno: `book`, `library`, `loans`, `heart`, `chart`, `phone`, `settings`, `search`, `plus`, `filter`, `grid`, `list`, `chevron-left`, `chevron-right`, `chevron-down`, `close`, `minimize`, `maximize`, `restore`, `check`, `pencil`, `trash`, `pin`, `wifi`, `server`, `monitor`, `link`, `grip`, `more`, `alert`, `info`, `logout`, `sun`, `moon`. `lucide-react` si importa solo in `Icon.tsx`.

## Test

Un file di test per componente, accanto al componente. Almeno:

- `Button`: si attiva con clic, Invio e Spazio; `loading` lo disabilita e mostra `Spinner` con nome accessibile; `disabled` non chiama `onClick`.
- `IconButton`: senza `label` non compila (controllo di tipo con `// @ts-expect-error`); il nome accessibile è `label`.
- `Field` con `Input`: l'etichetta è collegata al campo; con `error` il campo ha `aria-invalid="true"` e `aria-describedby` punta al messaggio.
- `Tag`, `Kbd`, `Divider`, `Skeleton` (`aria-hidden`), `EmptyState` (titolo come intestazione, azione facoltativa cliccabile).
- `Icon`: ogni nome di `IconName` produce un `svg` con `aria-hidden="true"`.
- `tokens.test.ts`: token nuovi presenti in chiaro e scuro.
- Un test legge ogni `*.module.css` di `src/base` e fallisce se trova un colore esadecimale, `rgb(` o `hsl(` fuori da `tokens.css`, oppure una `transition`/`animation` fuori da `@media (prefers-reduced-motion: no-preference)`.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` passa.
- `npm test -w @bookeeper/ui` passa.
- `npm run typecheck` e `npm test` dalla radice passano (gli altri pacchetti non si rompono).
- `grep -rn "lucide-react" packages/ui/src --include=*.tsx --include=*.ts -l` elenca solo `packages/ui/src/base/Icon.tsx` (e il suo test, se serve).
- Nessun componente supera 250 righe.
- Cambiano solo: `packages/ui/package.json`, `package-lock.json`, `packages/ui/tsconfig.json`, `packages/ui/vitest.config.ts`, `packages/ui/src/tokens.css`, `packages/ui/src/tokens.test.ts`, `packages/ui/src/test-setup.ts`, `packages/ui/src/css.d.ts`, file sotto `packages/ui/src/base/`.
