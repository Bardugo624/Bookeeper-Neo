Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Lettore: aspetto, selezione e note

## File
- `packages/reader/src/ui/look/`.
- `packages/i18n/src/locales/it/rlook.json` e `en/rlook.json`.

## Cosa fare
Componenti guidati dalle props, come negli schizzi `03`, `04` e `08`:
- **`AppearancePanel`:** le righe del design, ognuna cambia `ReaderSettings` con `onChange`.
  - I nomi dei caratteri sono scritti nel loro carattere.
  - Per i PDF le righe che non contano sono spente, con «Per i PDF valgono tema e zoom».
  - In fondo «Vale per tutti i libri su questo computer» (o «telefono») e «Ripristina».
  - Va in una finestrella sul computer e in un foglio sul telefono.
- **`SelectionToolbar`:**
  - quattro colori con il nome accessibile, «Nota», «Copia» e «Cerca sul web»;
  - per un'evidenziazione esistente: il colore segnato (`aria-pressed`) più «Togli»;
  - sopra la selezione sul computer, sotto sul telefono; si gira se non c'è posto, e resta nello schermo.
- **`NoteEditor`:**
  - testo, «Salva» e «Annulla»;
  - Ctrl/Cmd+Invio salva, Esc annulla;
  - finestrella sul computer, foglio sul telefono.

## Passi
- [ ] Test, prima del codice:
  - `every_row_changes_the_settings`;
  - `font_names_use_their_face`;
  - `pdf_disables_what_does_not_apply`;
  - `reset_returns_the_defaults`;
  - `toolbar_actions_call_back`;
  - `an_existing_highlight_shows_its_color_and_remove`;
  - `the_toolbar_flips_below_when_there_is_no_room`;
  - `the_phone_toolbar_sits_below_the_selection`;
  - `note_editor_saves_with_ctrl_enter_and_cancels_with_esc`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.
- [ ] Guarda i componenti in Chromium, nei quattro temi, e confrontali con gli schizzi.

## Acceptance criteria
- `npm test -w @bookeeper/reader`, `npm test -w @bookeeper/i18n` e `npm run typecheck -w @bookeeper/reader` passano.
- `impeccable detect --json` è pulito sui file nuovi.
