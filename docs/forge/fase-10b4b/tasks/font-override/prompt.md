Leggi prima `docs/forge/fase-10b4b/CONTRATTO.md` e la terza revisione in `docs/forge/fase-10b4b/REVISIONE.md`.

# Lettore: il carattere scelto arriva a tutto il libro

## File
`packages/reader/src/frame/bookCss.ts` con il suo test.

## Cosa fare
Immagini del sito `desktop-reader-light`, `desktop-reader-notes-dark` e `phone-reader-light`: con «Lora» scelta e gli stili dell'editore accesi, il testo resta nel serif di sistema. Il libro mette `font-family: Georgia, Times New Roman, Times, serif` su un contenitore `.testi`, e oggi la famiglia scelta va solo sul `body`, senza `!important`.

Quando il carattere non è «Editore», la famiglia va sul `body` con `!important`. Gli altri elementi la ereditano con `!important`, tranne quelli del contratto. Vale con gli stili dell'editore accesi e spenti.

## Test
- `a_chosen_font_reaches_a_book_that_names_its_own` (con `.testi { font-family: Georgia, serif }`).
- `monospace_and_images_keep_their_own`.
- `the_publisher_font_is_left_alone`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- `node packages/reader/e2e/run.mjs --browsers chromium --out /tmp/reader-e2e.json` passa.
