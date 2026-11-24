Leggi prima `docs/forge/fase-1e/CONTRATTO.md` e i quattro contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Core: backup nel futuro e larghezze dei caratteri accentati

## Obiettivo

Correggere due difetti P3 trovati dal revisore nel run 1D.

## 1. Backup programmato datato nel futuro entro la tolleranza

File: `crates/bookeeper-core/src/backup_schedule.rs` (intorno alla riga 233).

Oggi un backup automatico datato tra `now` e `now + 300` è considerato valido, è il più recente, e il controllo `!(0..interval).contains(&(now - t))` lo giudica scaduto perché `now - t` è negativo. Per cinque minuti ogni esecuzione crea un backup nuovo.

Regola: un backup fidato con data nel futuro vale come fatto adesso. L'età è `max(now - t, 0)`; un backup è dovuto solo se non ne esiste uno fidato o se l'età è `>= interval`. La regola dei 300 secondi oltre i quali un file è ignorato NON cambia.

Test, in `crates/bookeeper-core/tests/backup_schedule.rs` (segui la forma dei test esistenti):

- `a_backup_dated_slightly_ahead_is_not_due`: con un file `auto-…` datato `now + 200`, le esecuzioni a `now` e a `now + 60` non creano nulla.
- I test esistenti sui file oltre la tolleranza restano verdi senza modifiche.

## 2. Larghezze dei caratteri accentati nelle etichette

File: `crates/bookeeper-core/src/labels.rs` (`latin1_letter_width` e `glyph_width`).

La stima di larghezza NON DEVE mai essere inferiore alla larghezza reale del glifo in Helvetica (testo normale) o Helvetica-Bold (grassetto). Oggi `ì í î ï` valgono 222 (la `i`), ma Helvetica li disegna a 278; `ø` vale 556, ma Helvetica lo disegna a 611.

Larghezze reali, in millesimi di em, per i byte WinAnsi `0xC0..=0xFF`:

| Glifi | Helvetica | Helvetica-Bold |
| --- | --- | --- |
| `À Á Â Ã Ä Å` | 667 | 722 |
| `Æ` | 1000 | 1000 |
| `Ç` | 722 | 722 |
| `È É Ê Ë` | 667 | 667 |
| `Ì Í Î Ï` | 278 | 278 |
| `Ð` | 722 | 722 |
| `Ñ` | 722 | 722 |
| `Ò Ó Ô Õ Ö Ø` | 778 | 778 |
| `×` `÷` | 584 | 584 |
| `Ù Ú Û Ü` | 722 | 722 |
| `Ý` | 667 | 667 |
| `Þ` | 667 | 667 |
| `ß` | 611 | 611 |
| `à á â ã ä å` | 556 | 556 |
| `æ` | 889 | 889 |
| `ç` | 500 | 556 |
| `è é ê ë` | 556 | 556 |
| `ì í î ï` | 278 | 278 |
| `ð` | 556 | 611 |
| `ñ` | 556 | 611 |
| `ò ó ô õ ö` | 556 | 611 |
| `ø` | 611 | 611 |
| `ù ú û ü` | 556 | 611 |
| `ý ÿ` | 500 | 556 |
| `þ` | 556 | 611 |

Leggi come `glyph_width` tratta il grassetto prima di cambiare. Dove la stima attuale è già maggiore o uguale al valore della tabella, non toccarla. Dove è minore, portala almeno al valore della tabella.

Test, nel modulo `#[cfg(test)]` di `labels.rs` (o dove stanno già i test delle larghezze):

- `latin1_widths_are_never_below_helvetica`: per ogni byte `0xC0..=0xFF`, la stima in testo normale è `>=` la colonna Helvetica e la stima in grassetto è `>=` la colonna Helvetica-Bold. La tabella sta nel test, scritta per esteso.
- `a_title_full_of_accented_i_fits`: un titolo fatto di `"così lunedì sì"` ripetuto passa per `fit` e la larghezza reale del risultato (calcolata con 278 per `ì`) non supera la larghezza disponibile.

## Acceptance criteria

- `cargo test -p bookeeper-core --test backup_schedule` passa.
- `cargo test -p bookeeper-core --lib labels` passa.
- `cargo test -p bookeeper-core --test labels_api` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- Cambiano solo: `crates/bookeeper-core/src/backup_schedule.rs`, `crates/bookeeper-core/tests/backup_schedule.rs`, `crates/bookeeper-core/src/labels.rs`.
