Leggi prima `docs/forge/fase-10b2/CONTRATTO.md` e la revisione finale in `docs/forge/fase-10b2/REVISIONE.md`.

# Lettore: Lora di riserva e segni della ricerca

## File
`packages/reader/src/frame/`.

## Cosa fare
- **Lora di riserva** (tutte le catture contro lo schizzo `01`). Con «Editore» e gli stili dell'editore accesi:
  - `bookCss` mette Lora su `html`, così le regole del libro la superano solo se nominano un carattere;
  - quando una pagina si carica, se la famiglia calcolata del `body` è solo un nome generico (`serif`, `sans-serif`, `Times New Roman`, `Times`) e la pagina non ha `@font-face`, il `body` riceve Lora.
- **Segni della ricerca** (cattura `desktop-08` contro lo schizzo `06`): il risultato scelto ha un contorno con 2 px di margine dalle lettere; gli altri sono sottolineati (`Overlayer.underline`).

## Test
- `a_page_with_only_a_generic_family_gets_lora`.
- `a_page_with_its_own_face_keeps_it`.
- `only_the_chosen_result_is_outlined`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
- `node packages/reader/e2e/run.mjs --browsers chromium` passa.
