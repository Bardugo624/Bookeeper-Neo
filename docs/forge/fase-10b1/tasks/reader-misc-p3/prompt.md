Leggi prima `docs/forge/fase-10b1/CONTRATTO.md`.

# Lettore: link nel tema scuro, annunci della ricerca e note senza attese

## File
`packages/reader/src/frame/bookCss.ts` con il suo test, `packages/reader/src/ui/panel/` e `packages/reader/src/data/`.

## Cosa fare
- **Link nei temi scuri:** con gli stili dell'editore accesi, il colore dei link del tema vince anche su una regola più specifica del libro (`!important`), così un indice con `a:link { color: #000 }` resta leggibile.
- **Annunci della ricerca:** il conteggio in `aria-live` non cambia a ogni risultato. Si annuncia quando la ricerca finisce, e mentre cerca al massimo ogni 2 secondi.
- **Note:** `since` avanza anche con gli `updated_at` delle proprie scritture, così un libro senza note non chiede tutto da capo a ogni sincronizzazione.

## Test
- `theme_link_color_beats_a_specific_book_rule`.
- `search_count_is_announced_at_the_end_not_per_result`.
- `own_writes_move_since_forward`.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
