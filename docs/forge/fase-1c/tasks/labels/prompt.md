Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Etichette PDF con DataMatrix

## Obiettivo

`POST /api/v1/labels/pdf` a parità con la 0.3. Generazione in `crates/bookeeper-core/src/labels.rs`, rotta in `api/labels.rs`. Riferimento: `server/internal/api/labels.go` (sola lettura).

## Codice dell'etichetta

Dodici cifre: `PPPP` numero progressivo del libro, `XX` posto sulla mensola contato da 1, `YY` mensola contata da 1, `ZZZZ` `label_code` dello scaffale. Un libro non collocato ha `XX`, `YY`, `ZZZZ` a zero.

```rust
pub struct Label { pub progressive: i64, pub title: String, pub authors: String,
                   pub shelf_name: Option<String>, pub shelf_code: i64, pub row: i64, pub slot: i64 }  // row e slot già contati da 1; 0 = non collocato
pub fn label_code(l: &Label) -> String;                      // sempre 12 cifre; i valori oltre il campo sono ridotti modulo 10^n
pub fn render_pdf(labels: &[Label]) -> Result<Vec<u8>, LabelError>;
```

## Impaginazione

A4 verticale, griglia 4 colonne × 11 righe, etichette da 48 × 25 mm, centrate sul foglio: 44 per pagina. In ogni etichetta: a sinistra il DataMatrix del codice (lato circa 18 mm, con il margine bianco che lo standard richiede); a destra tre righe di testo: `N. <progressivo>` in grassetto, il titolo, e `<scaffale> · M<mensola> · P<posto>` oppure `non collocato`.

- Il testo non esce mai dall'etichetta: il titolo è troncato con `…` alla larghezza disponibile.
- Font incorporati standard del PDF (Helvetica). I caratteri fuori da Latin-1 (per esempio cirillico o CJK) sono sostituiti con `?`: è un limite noto, non un errore.
- Il PDF è deterministico: stessi dati, stessi byte (nessuna data di creazione variabile, nessun id casuale).

## Rotta

`POST /labels/pdf` (`AuthUser`, ogni ruolo) con `{ "book_ids": [id] }`, da 1 a 2.000, altrimenti 422.
- Produce un'etichetta per ogni libro della libreria che ha un numero progressivo, nell'ordine di `book_ids`, senza doppioni.
- Gli id sconosciuti, di un'altra libreria o di libri senza progressivo sono saltati e contati nell'intestazione `X-Labels-Skipped`.
- Se nessun libro produce un'etichetta → 422 `validation`.
- Risposta `application/pdf` con `util::download` e nome `etichette-<AAAAMMGG>.pdf`.
- La generazione è lavoro bloccante: `spawn_blocking`.

## Test (`crates/bookeeper-core/tests/labels_api.rs`)

- `label_code_layout`: progressivo 42, posto 7, mensola 3, scaffale 12 → `004207030012`.
- `label_code_for_unplaced_books`: `004200000000`.
- `label_code_wraps_oversized_values`: progressivo 12345 → inizia con `2345`; sempre 12 cifre.
- `datamatrix_round_trips`: il simbolo generato per un codice, decodificato con `datamatrix`, restituisce le stesse 12 cifre (se il crate non decodifica, verifica almeno dimensione e che codici diversi diano simboli diversi).
- `pdf_starts_with_the_magic_bytes_and_is_deterministic`: `%PDF-`, e due chiamate danno gli stessi byte.
- `page_count_follows_the_grid`: 1 etichetta → 1 pagina; 44 → 1; 45 → 2; 100 → 3 (conta gli oggetti `/Type /Page` che non sono `/Pages`).
- `long_and_non_latin_titles_do_not_fail`: un titolo di 300 caratteri e uno in cirillico.
- Rotta: `route_returns_a_pdf_with_the_skipped_count`; `books_without_progressive_are_skipped`; `other_library_books_are_skipped`; `duplicates_produce_one_label`; `nothing_to_print_is_validation`; `zero_and_2001_ids_are_validation`; `guest_can_print`; `route_needs_a_token`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test labels_api` passa con tutti i test elencati.
- Cambiano solo `labels.rs`, `api/labels.rs`, `tests/labels_api.rs`.
- La rotta compare in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
