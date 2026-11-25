# Contratto del run 4B

Valgono per intero i contratti `docs/forge/fase-2a`, `fase-2b`, `fase-2c` (regole del codice React, moduli, `kit`, sezioni delle impostazioni, piattaforma) e `docs/forge/fase-2a/MOCKUP.md`. Le rotte e i tipi sono quelli di `docs/forge/fase-4a/CONTRATTO.md`, già nel client `@bookeeper/api`. Qui ci sono solo le aggiunte.

## Regole aggiunte

- Nessuna dipendenza nuova, né npm né Rust. Nessuna modifica al core, a `packages/api`, a `packages/ui`: se manca qualcosa, la task si ferma e lo dice.
- Un modulo tocca solo la propria cartella e i propri file i18n. Le task che toccano `modules/books` vanno in fila (`reading-ui` → `tags-ui` → `filters-ui`): ognuna parte dal lavoro della precedente e non riscrive ciò che funziona.
- Lo stato di lettura è personale: ogni membro vede e scrive il proprio, anche chi non può modificare i libri.
- Nessuna libreria di grafici, di date o di animazione. Calendari e barre si disegnano con HTML, CSS e SVG, con i valori leggibili dalle tecnologie assistive.
- Dopo ogni scrittura si invalidano le query toccate: elenco e dettaglio dei libri, faccette, statistiche, statistiche di lettura.

## Scorciatoie (da `palette`)

| Tasti | Effetto |
| --- | --- |
| `Ctrl K` / `Cmd K` | apre la palette dei comandi |
| `/` | porta il fuoco al campo di ricerca della vista (prima era `Ctrl K`) |
| `g` poi `l`, `s`, `p`, `w`, `t`, `d`, `i` | va a Libri, Scaffali, Prestiti, Wishlist, sTatistiche, Dispositivi, Impostazioni |
| `n` | nuovo libro (apre `/books?new=1`) |
| `?` | mostra l'elenco delle scorciatoie |
| `Esc` | chiude palette, dialog, pannelli |

Le scorciatoie a tasto singolo non scattano mentre il fuoco è in un campo di testo o un dialog è aperto. Il tasto `Ctrl K` mostrato nel campo di ricerca dei Libri diventa `/`.

## Indirizzi che i moduli rispettano

- `/books?new=1` apre il pannello "Nuovo libro" (da `filters-ui`, ultima task sui Libri).
- `/books?reading=<stato>`, `?tag=<id>`, `?room=<id>`: filtri nell'indirizzo.
- `/shelves?unit=<id>&book=<id>` evidenzia un libro sul mobile (esiste già).

## Punti di contatto

- `modules/reading` esporta da `index.ts`: `ReadingCard` (`{ book }`), `ReadingRing` (`{ reading, pageCount, size }`), `ReadingStatusMenu` (`{ bookId, reading }`), `useReading(bookId)`, `READING_STATUSES`.
- `modules/tags` esporta: `TagChips` (`{ tags }`), `TagPicker` (`{ value: string[]; onChange }`), `ManageTagsDialog`, `useTags()`.
- I colori dei tag e degli scaffali vengono da `SHELF_COLORS` di `@bookeeper/ui/shelf`.
