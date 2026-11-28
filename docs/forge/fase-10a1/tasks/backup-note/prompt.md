Leggi prima `docs/forge/fase-10a1/CONTRATTO.md`.

# Computer: la nota sugli e-book nel backup

## File
- `apps/desktop/src/modules/settings/sections/backup/`.
- `apps/desktop/src/modules/settings/SettingsBlock.tsx`, se serve rendere `children` facoltativo.

## Cosa fare
- In `BackupSection.tsx` il blocco «Gli e-book» mette il testo come figlio, dentro un `<p>` con i margini del browser.
- Il risultato è un vuoto fra titolo e testo, e un testo più grande e più scuro delle descrizioni degli altri blocchi.
- Il testo diventa la `description` del blocco, come negli altri blocchi della sezione.

## Test
Il testo della nota è la descrizione del blocco: lo stesso elemento e la stessa classe delle descrizioni degli altri blocchi.

## Acceptance criteria
- `npx vitest run src/modules/settings src/kit/styles.test.ts` (da `apps/desktop`) passa.
- `npm run typecheck -w @bookeeper/desktop` passa.
