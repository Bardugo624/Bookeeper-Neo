Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Telefono: Leggi e In lettura

## File
- `apps/mobile/src/modules/search/`.
- `apps/mobile/src/modules/reading/`.
- `packages/i18n/src/locales/{it,en}/msearch.json` e `mreading.json`.

## Cosa fare
- **«Leggi» nella scheda del libro:**
  - pulsante primario sopra i file, se il libro ha un file e la persona può leggerlo (`canSeeFiles`);
  - «Leggi · 4%» se il libro è iniziato;
  - porta a `/read/:id`.
- **«In lettura» in Cerca**, come nello schizzo `09`:
  - quando il campo è vuoto, una riga che scorre di lato;
  - copertine verticali, titolo e barra con la percentuale;
  - i libri «In lettura» con un file, i più recenti per primi;
  - un tocco apre il lettore.

## Passi
- [ ] Test, prima del codice:
  - `read_shows_only_for_who_can_read_files`;
  - `read_says_the_percent`;
  - `reading_now_shows_only_with_an_empty_field`;
  - `reading_now_is_recent_first`;
  - `a_cover_opens_the_reader`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.
- [ ] Guarda Cerca e la scheda in Chromium a 390×844, chiaro e scuro, e confrontali con lo schizzo `09`.

## Acceptance criteria
- `npm test -w apps/mobile`, `npm test -w @bookeeper/i18n` e `npm run typecheck -w apps/mobile` passano.
- `impeccable detect --json` è pulito sui file toccati.
