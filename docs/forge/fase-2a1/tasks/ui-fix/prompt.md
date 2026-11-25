Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Ogni correzione ha un test che fallisce prima e passa dopo.

# UI: sei difetti P3 e caratteri inclusi

## Difetti da correggere

1. **`Button` con testo inglese** (`src/base/Button.tsx`): il valore predefinito `loadingLabel = 'Loading'` è testo scritto nel componente. Regola: nessun predefinito. Il tipo delle proprietà rende `loadingLabel` obbligatorio quando `loading` può essere vero (unione discriminata o sovraccarico): `<Button loading>` senza `loadingLabel` non compila. Stessa regola per ogni altro componente di `packages/ui` che abbia un testo predefinito scritto dentro: cercali e correggili allo stesso modo.
2. **Fuoco dopo un `Dialog` aperto da un `Menu`** (`src/overlays/Dialog.tsx`): alla chiusura il fuoco finisce su `<body>`. Regola: se l'elemento che aveva il fuoco all'apertura non è più nel documento, il fuoco va al pulsante che apre il `Menu` (l'ultimo elemento focalizzabile ancora presente che l'ha preceduto); in mancanza, al primo elemento focalizzabile della pagina. Mai su `<body>`.
3. **`Tooltip` con fornitore proprio** (`src/overlays/Tooltip.tsx`): ogni tooltip aspetta sempre 300 ms. Regola: esporta `TooltipProvider`; un `Tooltip` dentro un `TooltipProvider` usa quello, così passando da un elemento al vicino il secondo compare subito; fuori da un fornitore continua a funzionare da solo.
4. **Colori con nome nei CSS** (`src/book/BookCover.module.css`, `Book3D.module.css`): `white` e `black` scritti nei moduli. Regola: aggiungi a `tokens.css`, in chiaro e in scuro, `--bk-cover-light` e `--bk-cover-shade` e usali. I tre test di stile (`base`, `overlays`, `book`) DEVONO rifiutare anche i colori con nome CSS (lista completa delle parole chiave, esclusi `transparent`, `currentColor`, `inherit`): un solo modulo di aiuto condiviso dai tre test.
5. **`ProgressRing` e figli falsi** (`src/book/ProgressRing.tsx`): `{0}` come figlio non viene mostrato. Regola: si mostra tutto tranne `null`, `undefined` e `false`.
6. **`Book3D` con `pages={Infinity}`** (`src/book/Book3D.tsx`): dà 24px invece di 40. Regola: `Infinity` vale come "800 o più"; `NaN`, zero e negativi valgono come assente.

## Caratteri

L'app mostra il carattere di ripiego perché Inter e Lora non sono inclusi. Aggiungi a `packages/ui` le dipendenze `@fontsource-variable/inter` e `@fontsource-variable/lora` (`npm install` dalla radice) e un file `src/fonts.css` che le importa (pesi variabili, normale e corsivo per Lora; sottoinsiemi `latin` e `latin-ext`). Esportalo in `package.json` come `./fonts.css`. Verifica che i nomi di famiglia dichiarati dai pacchetti coincidano con quelli in `--bk-font-ui` e `--bk-font-serif`; se differiscono (per esempio `Inter Variable`), metti il nome variabile per primo nelle due pile dei token senza togliere i ripieghi. Nessun carattere si scarica da Internet a tempo di esecuzione.

## Test

- `Button`: `// @ts-expect-error` su `<Button loading>` senza etichetta; con etichetta lo `Spinner` ha quel nome.
- `Dialog`: aperto da una voce di `Menu`, chiuso con Esc → il fuoco è sul pulsante del menu, non su `body`.
- `Tooltip`: due tooltip dentro un `TooltipProvider`, timer finti: il primo dopo 300 ms, il secondo subito passando dal primo; un tooltip senza fornitore funziona.
- Stile: un CSS di prova con `color: red` è rifiutato dal modulo di aiuto; `transparent` e `currentColor` sono accettati; i tre test passano sui file veri.
- `ProgressRing`: `{0}` è nel DOM; `false` e `null` no.
- `Book3D`: `Infinity` → 40px; `NaN`, `0`, `-5` → 24px.
- `tokens.test.ts`: i due token nuovi in chiaro e scuro; le pile di caratteri iniziano con la famiglia inclusa.
- `fonts.css` esiste e ogni `@import` punta a un file presente in `node_modules`.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui` e `npm test -w @bookeeper/ui` passano.
- `npm run typecheck -w @bookeeper/desktop` passa (chi usa `Button loading` senza etichetta va segnalato nel rapporto, non corretto qui: se il controllo fallisce per questo, elenca i punti e fermati).
- Cambiano solo file sotto `packages/ui/` e `package-lock.json`.
