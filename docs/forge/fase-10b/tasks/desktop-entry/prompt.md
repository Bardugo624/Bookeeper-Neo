Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Computer: Leggi, Continua e In lettura

## File
- `apps/desktop/src/modules/books/`.
- `apps/desktop/src/modules/reading/`.
- `packages/i18n/src/locales/{it,en}/books.json` e `reading.json`.

## Cosa fare
- **«Leggi» nella scheda del libro:**
  - pulsante primario nella barra della scheda, se il libro ha un file e il ruolo è almeno `member`;
  - dice «Leggi · 4%» se il libro è iniziato;
  - se ci sono più file, un menu accanto apre gli altri («Apri il PDF»);
  - porta a `/read/:id?file=`.
- **La card «Lettura»** riceve «Continua · 45%» quando il libro è in lettura e ha un file.
- **`ReadingNow`**, in `modules/reading`, come nello schizzo `09`:
  - riga in cima alla libreria, sopra la griglia, solo senza filtri né ricerca;
  - al massimo 4 card, con copertina (`BookCover`), titolo, autore e `FillBar` con la percentuale;
  - i libri «In lettura» con un file, i più recenti per primi;
  - «Tutti i N» applica il filtro «In lettura»;
  - un clic apre il lettore.

## Passi
- [ ] Test, prima del codice:
  - `read_shows_only_with_a_file_and_a_role`;
  - `read_says_the_percent`;
  - `other_files_open_from_the_menu`;
  - `the_reading_card_offers_continue`;
  - `reading_now_hides_with_filters_or_search`;
  - `reading_now_shows_at_most_four_recent_first`;
  - `all_applies_the_reading_filter`;
  - `a_card_opens_the_reader`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.
- [ ] Guarda la libreria e la scheda in Chromium, chiaro e scuro, e confrontale con lo schizzo `09`.

## Acceptance criteria
- `npm test -w apps/desktop`, `npm test -w @bookeeper/i18n` e `npm run typecheck -w apps/desktop` passano.
- `impeccable detect --json` è pulito sui file toccati.
