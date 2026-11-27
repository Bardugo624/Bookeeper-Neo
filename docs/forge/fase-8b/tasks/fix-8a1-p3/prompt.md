Leggi prima `docs/forge/fase-8b/CONTRATTO.md` e `docs/forge/fase-8a/CONTRATTO.md` (sezione «Il tour»). La task `calm-books` è già unita.

# Ultimi rilievi del run 8A1

1. **[P3] Tour, passo «Salva» nel pop-up largo** (`apps/desktop/src/modules/tour/placement.ts`): con la finestra di 1280×800 accanto al pop-up largo (760 px) non c'è spazio, e la scheda del tour ripiega sopra «Salva», sulla parte destra del modulo, coprendo in parte i comandi dei gruppi e i campi che il passo chiede di controllare. La scheda NON DEVE coprire elementi interattivi del dialogo. Soluzioni accettate: una scheda più stretta che entri accanto al pannello quando lo spazio basta; altrimenti la scheda dentro il dialogo, nel suo flusso (per esempio sopra le azioni in fondo), senza sovrapporsi a nulla. Test a 1280×800 e a 1024×768 con i riquadri simulati: la scheda non interseca nessun elemento interattivo del pannello.
2. **[P3] Ripristino** (`apps/desktop/src/modules/settings/sections/backup/RestoreBlock.tsx`): dopo un ripristino riuscito torna la riga «Scegli prima un file di backup.» sopra «Ripristino completato». Nascondila mentre si vede l'esito del ripristino. Test.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/tour src/modules/settings src/kit/styles.test.ts` (da `apps/desktop`) passa.
- Cambiano solo `apps/desktop/src/modules/tour/`, `apps/desktop/src/modules/books/BookSheet.tsx` e `BookSheet.module.css` (solo se serve un posto per la scheda nel flusso del pop-up), e `apps/desktop/src/modules/settings/sections/backup/`.
