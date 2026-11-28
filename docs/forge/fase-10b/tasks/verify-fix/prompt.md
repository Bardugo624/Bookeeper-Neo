Leggi prima `docs/forge/fase-10b/CONTRATTO.md`. Tutte le altre task della 10B sono già unite.

# Verifica: formato, nomi dei test e dati finti

La verifica dell'insieme del run fallisce. Correggi solo questi tre punti, senza cambiare il comportamento dell'app.

## File
- `crates/bookeeper-core/tests/ebook_api.rs`.
- `apps/mobile/src/modules/reader/reader.test.tsx`, da rinominare in `ReaderRoute.test.tsx`.
- `apps/mobile/src/modules/search/readButton.test.tsx`, da rinominare in `ReadButton.test.tsx`.
- `apps/mobile/src/modules/shelves/ShelvesPage.test.tsx`.

## Cosa fare
1. **Formato:** `cargo fmt` su `crates/bookeeper-core/tests/ebook_api.rs`. Oggi `cargo fmt --check` fallisce lì.
2. **Nomi che collidono senza maiuscole:** `packages/ui/src/caseCollisions.test.ts` fallisce per due coppie:
   - `Reader.module.css` e `reader.test.tsx`, in `apps/mobile/src/modules/reader/`;
   - `ReadButton.tsx` e `readButton.test.tsx`, in `apps/mobile/src/modules/search/`.

   Rinomina i due test con `git mv`. Il contenuto non cambia.
3. **Dati finti:** in `ShelvesPage.test.tsx` il libro finto `BOOK` non ha `file_formats`, che `BookOut` richiede. Il nuovo `ReadButton` legge `book.file_formats.length`, e la scheda del libro si rompe nel test «has "Apri il mobile" in the where block of a shelved book». Aggiungi `file_formats: []` al libro finto.

## Acceptance criteria
- `cargo fmt --all -- --check` passa.
- `npx vitest run src/caseCollisions.test.ts` in `packages/ui` passa.
- `npx vitest run src/modules/shelves src/modules/search src/modules/reader` in `apps/mobile` passa.
