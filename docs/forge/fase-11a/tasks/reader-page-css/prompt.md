Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Lettore: Lora di riserva, carattere scelto e immagini nei temi scuri

## File
In `packages/reader/src/frame/`: `fallbackFont.ts` e `bookCss.ts`, con i loro test. `boot.ts` non si tocca.

## Cosa fare
Come dice il contratto (sezione hotfix):
- Lora di riserva sugli elementi di testo con «Editore»;
- `@layer reader-font` per il carattere scelto;
- immagini attenuate in Scuro e Nero.

## Test
- `an_inner_element_with_a_missing_family_gets_lora`.
- `an_available_or_embedded_family_is_kept`.
- `the_chosen_font_beats_an_important_book_rule` (con `.testi { font-family: Georgia, serif !important }`).
- `images_are_dimmed_only_in_dark_themes`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- `node packages/reader/e2e/run.mjs --browsers chromium --out /tmp/reader-e2e.json` passa.
