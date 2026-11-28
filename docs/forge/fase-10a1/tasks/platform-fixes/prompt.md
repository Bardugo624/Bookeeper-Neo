Leggi prima `docs/forge/fase-10a1/CONTRATTO.md` e `docs/forge/fase-10a/CONTRATTO.md`.

# Computer: download occupato e link trascinati

## File
- `apps/desktop/src-tauri/src/` e `apps/desktop/src-tauri/tests/`.
- `apps/desktop/src/platform/`.
- Per il messaggio:
  - `apps/desktop/src/modules/books/useBookFiles.ts`, `BookFileRow.tsx` e `BookFiles.test.tsx`;
  - `packages/i18n/src/locales/{it,en}/books.json`.

## Cosa fare
1. **Il download occupato si dice.**
   - Oggi `download_file`, in `lib.rs`, prende un lucchetto. Se un altro download lo tiene, risponde `cancelled()` e la scheda non dice niente.
   - Il lucchetto resta, perché evita due finestre di salvataggio aperte insieme.
   - L'esito diventa «occupato», distinto da «annullato» in `DownloadResult` e nell'esito di Tauri.
   - La riga del file mostra il messaggio del contratto.
   - Test in `src-tauri/tests/`, in `src/platform/` e in `BookFiles.test.tsx`.
2. **Anche i link trascinati.**
   - Oggi `fileDropGuard` annulla solo i trascinamenti che portano `Files`. Un link trascinato da un'altra app (`text/uri-list` o `text/plain`) e lasciato cadere fuori da un campo di testo fa aprire la pagina al posto dell'app.
   - La protezione annulla anche questi, tranne sopra un campo modificabile: `input`, `textarea` o `[contenteditable]`. Lì trascinare un testo continua a funzionare.
   - Test in `src/platform/fileDropGuard.test.ts`.

## Acceptance criteria
- `cargo test -p bookeeper-desktop`, `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` e `cargo fmt --all -- --check` passano.
- `npx vitest run src/platform src/modules/books src/kit/translationKeys.test.ts` (da `apps/desktop`) passa.
- `npm run typecheck -w @bookeeper/desktop` passa.
