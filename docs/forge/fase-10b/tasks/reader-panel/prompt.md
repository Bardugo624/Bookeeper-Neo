Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Lettore: il pannello con indice, note e ricerca

## File
- `packages/reader/src/ui/panel/`.
- `packages/i18n/src/locales/it/rpanel.json` e `en/rpanel.json`.

## Cosa fare
Componenti guidati dalle props, come negli schizzi `02`, `06` e `07`:
- **`CompanionPanel`:** schede Indice, Note e Cerca con `PillTabs`. Due varianti: `aside` di 360 px sul computer, foglio sul telefono (`Sheet` di `ui/view`).
- **`TocList`:**
  - capitoli annidati e percentuale d'inizio;
  - il corrente tinto e visibile senza scorrere;
  - il clic chiama `onGo(href)`.
- **`NotesList`:**
  - filtri «Tutte», «Segnalibri» e i quattro colori, con i conteggi;
  - voci con pallino o segnalibro, capitolo e percentuale, testo in Lora e nota;
  - menu della voce: «Modifica la nota», «Cambia colore», «Copia», «Togli»;
  - in fondo «Visibili solo a te» ed «Esporta in Markdown».
- **`SearchTab`:**
  - campo con «cancella»; almeno 2 caratteri;
  - risultati per capitolo, con la parola in evidenza;
  - «Cerco nel resto del libro… 60%» finché non finisce;
  - il conteggio annunciato (`aria-live="polite"`);
  - frecce e Invio per scegliere.

## Passi
- [ ] Test, prima del codice:
  - `toc_marks_the_current_chapter`, `toc_click_goes_to_href`;
  - `notes_filter_by_color_and_bookmarks`;
  - `note_menu_offers_edit_color_copy_remove`;
  - `remove_calls_back_without_confirmation`;
  - `export_calls_back`;
  - `search_waits_for_two_characters`;
  - `search_groups_results_by_chapter`;
  - `search_shows_progress_until_done`;
  - `result_count_is_announced`;
  - `arrow_keys_and_enter_choose_a_result`;
  - `the_phone_variant_is_a_sheet_with_the_same_tabs`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.
- [ ] Guarda il pannello in Chromium, nei quattro temi, e confrontalo con gli schizzi.

## Acceptance criteria
- `npm test -w @bookeeper/reader`, `npm test -w @bookeeper/i18n` e `npm run typecheck -w @bookeeper/reader` passano.
- `impeccable detect --json` è pulito sui file nuovi.
