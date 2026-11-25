Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Copertine ed etichette: due difetti rimasti dal run 1C

## Obiettivo

Chiudere il difetto P3 sulle larghezze dei caratteri nelle etichette e il difetto plausibile sulla concorrenza delle copertine.

## Correzioni

1. **Larghezza dei caratteri accentati** (`labels.rs`, `glyph_width`). Oggi ogni byte sopra `0x7E` vale 600 millesimi. Le maiuscole accentate sono più larghe: un titolo come `ÈÈÈÈ…` esce dall'etichetta. Regola: la larghezza stimata non è **mai inferiore** a quella reale di Helvetica.
   - Lettere accentate `0xC0..=0xFF`: la larghezza della lettera base (`À Á Â Ã Ä Å` → `A`, `È É Ê Ë` → `E`, `Ç` → `C`, `Ñ` → `N`, `Ò Ó Ô Õ Ö Ø` → `O`, `Ù Ú Û Ü` → `U`, `Ý` → `Y`, e così le minuscole; `ÿ` → `y`).
   - Casi a parte: `Æ` 1000, `æ` 889, `ß` 611, `Ð` 722, `ð` 556, `Þ` 667, `þ` 556, `×` e `÷` 584.
   - Simboli `0xA0..=0xBF`: 840 (nessuno è più largo di 834).
   - Byte WinAnsi `0x80..=0x9F` diversi dai puntini di sospensione: 1000.
   Il fattore del grassetto resta com'è.

2. **`PUT` e `DELETE` concorrenti** (`api/covers.rs`). Oggi un caricamento che corre insieme a un'eliminazione può lasciare `cover_file` e `cover_color` valorizzati senza file, o un file senza riga. Regola (invariante): dopo qualunque intreccio di `PUT`, `POST …/cover/fetch` e `DELETE` sullo stesso libro, o il libro ha `cover_file` e il file esiste su disco, o non ha né l'uno né l'altro, e in `covers_dir` non restano file di quel libro senza riga.
   Come ottenerlo: il database ha una sola connessione, quindi le chiusure di `db.run` non si intrecciano. Il passo "sposta il file definitivo + aggiorna la riga" e il passo "azzera la riga + cancella il file" DEVONO stare ciascuno dentro **una** chiusura di `db.run`. Decodifica e ricodifica dell'immagine restano fuori, come oggi, su un file temporaneo. Se la chiusura fallisce, il file temporaneo viene tolto.

## Test

- Test unitari in `labels.rs` (`#[cfg(test)]`):
  - `accented_letters_are_as_wide_as_their_base`: `text_width` di `"ÈÀÒ"` uguale a quella di `"EAO"`; `"èàò"` uguale a `"eao"`; in grassetto pure.
  - `symbols_are_never_underestimated`: `©`, `®`, `¼` hanno larghezza ≥ 834; `Æ` ≥ 1000.
  - `a_title_of_wide_accented_capitals_fits_its_box`: `fit` su quaranta `Ò` restituisce un testo la cui `text_width` è ≤ `max` e che finisce con i puntini.
- `tests/covers_api.rs`:
  - `concurrent_put_and_delete_keep_row_and_file_consistent`: runtime a più thread; per 30 volte lancia insieme un `PUT` e un `DELETE` sullo stesso libro e attendili; dopo ogni coppia verifica l'invariante leggendo la riga con SQL diretto e la cartella `covers_dir`. Alla fine nessun file temporaneo resta nella cartella.
  - I test esistenti passano invariati.

## Acceptance criteria

- `cargo test -p bookeeper-core --lib labels` e `cargo test -p bookeeper-core --test covers_api --test labels_api --test backup_api` passano.
- Il PDF di un'etichetta con solo caratteri ASCII è identico byte per byte a prima (i test esistenti di `labels_api` lo coprono: non modificarli).
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
- Cambiano solo: `labels.rs`, `api/covers.rs`, `tests/covers_api.rs` (tutti sotto `crates/bookeeper-core/`). Se serve toccare `covers.rs`, fermati e dillo.
