Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Lettore: tutto insieme

## File
- `packages/reader/src/app/`.
- `packages/i18n/src/locales/it/reader.json` e `en/reader.json`: solo chiavi nuove.

## Cosa fare
`ReaderApp` mette insieme motore, modello, interfaccia e dati. Props:

```ts
{ backend: ReaderBackend; book: { id: string; title: string; authors: string[] }; file: { id: string; sha256: string; format: string; name: string };
  platform: 'desktop' | 'phone'; locale: Locale; appDark: boolean; topEnd?: ReactNode; onClose(): void }
```

- **Apertura:** carica il file con l'avanzamento; monta la cornice; apre dove dice `openingTarget`, altrimenti all'inizio.
- **Regolazioni:** carica, salva e applica con `setLayout`. Un cambio non manda mai `goto`.
- **Domande:** «Continua da …» con `decideResume`; girare pagina vale «Resta qui». In fondo «Segna come letto», che chiama `markRead` solo al clic.
- **Salti:** indice, note, risultati, barra e «Vai al 45%» lasciano «Torna al …».
- **Posizioni:** il keeper su ogni `relocate`; `flush` alla chiusura, a `pagehide` e quando la pagina si nasconde.
- **Note:**
  - lo store, i segni nella cornice e il segnalibro della pagina;
  - la barra della selezione: evidenzia, nota, copia (`navigator.clipboard`), cerca sul web (`backend.openExternal` con l'indirizzo del contratto);
  - l'esportazione con `exportMarkdown` e `backend.saveText`.
- **Tempi:** `recordTurn` a ogni giro, e i tempi solo dopo 3 minuti.
- **Tema:** `auto` segue `appDark`.

## Passi
- [ ] Test con un `Engine` finto e un backend finto, prima del codice:
  - `opens_at_the_local_position`;
  - `asks_to_continue_and_never_jumps_by_itself`;
  - `turning_the_page_means_stay_here`;
  - `go_to_leaves_a_way_back`;
  - `layout_changes_never_send_goto`;
  - `the_end_asks_to_mark_as_read`;
  - `a_highlight_from_the_selection_is_saved_and_drawn`;
  - `copy_and_web_search_use_the_selection`;
  - `export_saves_markdown_with_the_right_name`;
  - `closing_flushes_the_position_first`;
  - `the_bookmark_toggles`;
  - `times_appear_only_after_three_minutes`;
  - `auto_theme_follows_the_app`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.

## Acceptance criteria
- `npm test -w @bookeeper/reader`, `npm test -w @bookeeper/i18n` e `npm run typecheck -w @bookeeper/reader` passano.
- Nessun componente supera 250 righe.
