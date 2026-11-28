Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Lettore: la pagina, le barre e i salti

## File
- `packages/reader/src/ui/view/`.
- `packages/i18n/src/locales/it/reader.json` e `en/reader.json`.

## Cosa fare
Componenti guidati dalle props, senza dati né client. Gli stati sono negli schizzi `01`, `02`, `05`, `06` e `07`.
- **`Reader`:** la disposizione.
  - Sul computer: barra in alto, pagina (il figlio, cioè la cornice), barra in basso, posto per il pannello e per le finestrelle.
  - Sul telefono: pagina a tutto schermo, barre sopra la pagina, posto per i fogli.
  - Prende il tema e applica `themeVars(theme)` alla radice.
- **`TopBar`:**
  - indietro, titolo e capitolo, Cerca, Segnalibro (pieno se attivo), Aspetto, Pannello;
  - uno spazio finale per i pulsanti della finestra, `topEnd`;
  - sul computer la barra è `data-tauri-drag-region`, tranne i pulsanti;
  - sul telefono: indietro, titolo, Aa e «⋯».
- **`BottomBar`:**
  - `ProgressSlider`, con le tacche, il suggerimento «Capitolo VIII · 21%» mentre si trascina, il salto al rilascio e `aria-valuetext`;
  - percentuale e tempi;
  - il posto della domanda, che sostituisce l'avanzamento finché c'è, con le sue azioni;
  - «Torna al …»;
  - sul telefono, anche Indice, Note, Cerca e Segna.
- **`useChrome`:** controlli visibili all'apertura, nascosti al primo giro. Tornano con Esc, con il mouse nella fascia alta o bassa (computer) o con un tocco al centro (telefono). Restano finché c'è una domanda o una finestrella.
- **`useReaderKeys`:** frecce, Pagina su/giù, Spazio e Maiusc+Spazio, Esc a strati, Ctrl/Cmd+F.
- **`Sheet`:** il foglio dal basso del telefono, come `BottomSheet` dell'app.
- **`ReaderStatus`:** «Apro il libro…» dopo 300 ms; gli errori del design con la loro azione.

## Passi
- [ ] Test, prima del codice:
  - `chrome_hides_on_the_first_turn_and_returns_on_esc`;
  - `mouse_brings_chrome_back_only_near_the_edges`;
  - `a_tap_in_the_center_toggles_chrome_on_the_phone`;
  - `esc_closes_the_top_layer_first`;
  - `scrubbing_shows_the_chapter_and_jumps_on_release`;
  - `the_question_replaces_the_progress_and_keeps_its_actions`;
  - `jump_back_calls_back`;
  - `loading_shows_after_300_ms_only`;
  - `errors_show_the_message_and_the_action`;
  - `the_slider_announces_percent_and_chapter`;
  - `the_desktop_top_bar_is_a_drag_region_with_a_slot_for_window_controls`;
  - `animations_sit_inside_reduced_motion_no_preference`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.
- [ ] Guarda i componenti in Chromium a 1280×800 e 390×844, nei quattro temi, e confrontali con gli schizzi. Le immagini non vanno nel commit.

## Acceptance criteria
- `npm test -w @bookeeper/reader`, `npm test -w @bookeeper/i18n` e `npm run typecheck -w @bookeeper/reader` passano.
- `impeccable detect --json` è pulito sui file nuovi.
