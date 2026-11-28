Leggi prima `docs/forge/fase-10a/CONTRATTO.md`, che fissa valori, interfacce e regole, e la parte «Fase 10A» del design `docs/superpowers/specs/2026-11-27-ebook-design.md`. Le task del core sono già unite: usa `packages/api`. La task `ebook-ui-files` è già unita.

# Computer: e-book trascinati sulla libreria diventano libri

## File
- `apps/desktop/src/modules/books/`: `BooksPage` e un dialogo nuovo di importazione.
- `packages/i18n/src/locales/{it,en}/ebooks.json`: un file nuovo.
- `apps/desktop/src-tauri/tauri.conf.json`: la finestra ha `"dragDropEnabled": false`. Altrimenti su Windows Tauri intercetta i file trascinati e la pagina non riceve gli eventi HTML5; vale anche per la zona di rilascio di `BookFiles`.
- Rinomina `apps/desktop/src/modules/books/bookFiles.ts` in `bookFileApi.ts` e aggiorna gli import: il nome collide con `BookFiles.tsx` sui file system che non distinguono maiuscole e minuscole (`packages/ui/src/caseCollisions.test.ts`).
- `apps/desktop/src/platform/` e `apps/desktop/src/main.tsx`: una protezione per tutta la finestra. Con `"dragDropEnabled": false` un file lasciato cadere dove nessuno lo gestisce fa aprire il file alla finestra, al posto dell'app. La protezione annulla `dragover` e `drop` dei file che nessuna pagina ha gestito, con `dropEffect = 'none'`; la installa `main.tsx`. Con un test in `src/platform/`.
- Nella pagina dei libri, `useEbookDrop` annulla sempre i trascinamenti di file, anche quando li ignora: dialogo aperto, ospiti.

## Cosa fare
1. **Trascinamento:** sulla pagina dei libri si possono trascinare uno o più e-book, se chi trascina può aggiungere libri. Si apre un dialogo con una riga per file.
2. **Per ogni file:**
   - si carica con `PUT /api/v1/ebook-files`, con un indicatore;
   - la riga mostra la copertina estratta, se c'è, con titolo e autori modificabili;
   - un errore resta sulla sua riga senza fermare gli altri file.
3. **Libri già presenti:** se esiste già un libro con lo stesso ISBN, o con lo stesso titolo e gli stessi autori, la riga lo dice e propone «Attacca a quel libro» invece di crearne uno nuovo.
4. **Conferma:** «Aggiungi N libri» crea i libri, con `format = "ebook"` e i metadati, poi attacca i file. Alla fine un riepilogo dice quanti sono stati aggiunti e quanti attaccati.
5. Il dialogo usa il `Dialog` del kit, `size="wide"`.

## Test
- Trascinamento di due EPUB → due righe con i metadati → conferma → due libri creati con i file.
- Un file protetto da DRM resta in errore sulla sua riga, e gli altri si aggiungono.
- Un libro già presente → «Attacca a quel libro».
- Chi non può modificare non vede il trascinamento.

## Acceptance criteria
- `npm run typecheck -w @bookeeper/desktop` passa.
- `npx vitest run src/modules/books src/platform src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa.
- `impeccable detect --json` pulito sui file cambiati.
- `npx vitest run src/caseCollisions.test.ts` (da `packages/ui`) passa.
