Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Lettore: regolazioni, temi, colori, domande e conti

## File
- `packages/reader/src/model/`, con `index.ts` che esporta tutto.
- `packages/reader/src/styleCheck.test.ts`: colori letterali solo in `src/model/themeColors.ts` e `src/model/highlightColors.ts`.

## Cosa fare
Funzioni pure, con i nomi e i valori del contratto:
- **`settings.ts`:** `DEFAULT_SETTINGS`, `normalizeSettings(raw)`, `loadSettings(storage)` e `saveSettings(storage, s)`. Il salvataggio non lancia mai.
- **`themeColors.ts`, `themes.ts`:**
  - `THEME_COLORS`;
  - `resolveTheme(choice, appDark)`;
  - `themeVars(theme)`, con le variabili CSS `--rd-*` per l'interfaccia del lettore.
- **`highlightColors.ts`, `highlights.ts`:** `HIGHLIGHT_COLORS`, `veil(color, theme)` e `swatch(color, theme)`.
- **`frameLayout.ts`:** `frameLayout(settings, theme, reducedMotion)`, che restituisce un `FrameLayout`.
- **`resume.ts`:**
  - `decideResume(local, sources, deviceId)`, che restituisce `ResumeOffer | null`;
  - `openingTarget(local, sources, deviceId)`, che restituisce `Target | null`: la propria posizione salvata sul server, se quella locale manca.

  Una fonte è `{ kind: 'device', deviceId, deviceKind, sameFile, value, percent, at }` oppure `{ kind: 'page', page, percent, at }`.
- **`speed.ts`:** `recordTurn(state, chars, dwellMs)` e `minutesLeft(state, chars)`.
- **`jumps.ts`:** il «Torna al …», con `jumpFrom(target, percent)`, `afterTurn(jump, direction)` e `isExpired(jump)`.
- **`ticks.ts`:** `chapterTicks(toc, sectionFractions)`.
- **`markdown.ts`:** `exportMarkdown(meta, items, labels)` e `markdownFileName(meta)`.

## Passi
- [ ] Test, prima del codice:
  - `defaults_when_storage_is_empty`, `bad_fields_fall_back_one_by_one`, `font_size_is_clamped_and_rounded`, `saving_survives_a_storage_that_throws`;
  - `auto_follows_the_app`, `every_theme_reaches_4_5_to_1`, `ink_reaches_4_5_to_1_on_every_veil`;
  - `reduced_motion_turns_animation_off`, `two_pages_off_gives_one_column`;
  - `no_offer_when_this_device_is_ahead`, `offer_when_another_device_is_ahead_and_newer`, `ignores_sources_less_than_one_point_ahead`, `ignores_older_sources`, `picks_the_furthest_then_the_newest`, `own_server_copy_is_where_the_book_opens`, `a_hand_typed_page_is_offered_with_its_page`;
  - `short_and_long_pages_do_not_count`, `times_appear_after_three_measured_minutes`, `moving_average_weighs_new_pages_0_2`;
  - `jump_back_expires_after_two_forward_turns`, `a_backward_turn_does_not_count`;
  - `ticks_are_the_top_level_chapters_sorted_and_unique`;
  - `export_matches_the_contract_example`, `english_labels`, `file_name_drops_forbidden_characters`, `multi_paragraph_notes_stay_intact`;
  - `literal_colors_only_in_the_two_data_files`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.

## Acceptance criteria
- `npm test -w @bookeeper/reader` e `npm run typecheck -w @bookeeper/reader` passano.
