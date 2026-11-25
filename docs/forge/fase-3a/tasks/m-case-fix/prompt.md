Leggi prima `docs/forge/fase-3a/CONTRATTO.md`.

# Mobile: nomi di file che differiscono solo per maiuscole

La verifica del run fallisce su `packages/ui/src/caseCollisions.test.ts`, che vieta nella stessa cartella due nomi di file uguali a parte le maiuscole (su Windows e macOS collidono). In `apps/mobile/src` ce ne sono tre gruppi:

- `modules/account/Account.module.css` e `modules/account/account.test.tsx`
- `modules/pair/Pair.module.css` e `modules/pair/pair.test.tsx`
- `shell/Shell.module.css`, `shell/Shell.tsx` e `shell/shell.test.tsx`

## Cosa fare

Rinomina con `git mv` i file di test perché abbiano le stesse maiuscole del file che provano (`Account.test.tsx`, `Pair.test.tsx`, `Shell.test.tsx`) e aggiorna ogni riferimento. Nessun cambiamento di contenuto. Poi esegui il test delle collisioni e correggi allo stesso modo ogni altro gruppo che segnala sotto `apps/mobile/`.

## Acceptance criteria

- `npm test -w @bookeeper/ui` passa (compreso `caseCollisions.test.ts`).
- `npm run typecheck -w @bookeeper/mobile` e `npm test -w @bookeeper/mobile` passano.
- Cambiano solo file sotto `apps/mobile/src/`, e solo per rinomina.
