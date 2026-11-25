Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Lookup: sei difetti rimasti dal run 1C

## Obiettivo

Chiudere sei difetti P3 dei fornitori Google Books e Open Library. Il testo condiviso va in un modulo solo. Riferimento per la parità: `server/internal/lookup/` (Go, sola lettura).

## Correzioni

1. **Modulo condiviso** `lookup/text.rs` (nuovo, dichiarato in `lookup/mod.rs` con una riga `mod text;`). Contiene:
   - `strip_html(&str) -> String`: toglie i tag, va a capo su `br`, `p`, `div`, `li`, `ul`, `ol`, decodifica le entità. Un `<` apre un tag solo se è seguito da una lettera ASCII, da `/` o da `!`. Un `<` isolato (`a < b`) e un tag mai chiuso restano testo.
   - `decode_entities(&str) -> String`: numeriche decimali ed esadecimali (`&#233;`, `&#xE9;`); nominali almeno: `amp lt gt quot apos nbsp hellip mdash ndash lsquo rsquo ldquo rdquo laquo raquo copy reg euro deg`, e le vocali accentate italiane, francesi, spagnole e tedesche maiuscole e minuscole (`agrave egrave eacute igrave ograve ugrave aacute iacute oacute uacute acirc ecirc icirc ocirc ucirc auml euml iuml ouml uuml ccedil ntilde szlig`). Un'entità sconosciuta resta com'è. `&nbsp;` diventa uno spazio normale.
   - `read_limited(resp: reqwest::Response, max: usize) -> Result<String, String>`: legge a pezzi; oltre `max` byte restituisce errore senza leggere il resto.
   Google e Open Library usano queste funzioni e perdono le loro copie.

2. **Limite di dimensione** (`google.rs`, `openlibrary.rs`). Il corpo si legge con `read_limited` e limite 1 MiB, come nel Go. Oltre il limite: `ProviderError`. Anna's Archive ha già il suo limite: non toccarlo.

3. **Anno** (`google.rs`, `parse_year`). L'anno è una sequenza di **esattamente** quattro cifre, non adiacente ad altre cifre, tra 1000 e 2100. `"20231"` e `"120050"` non danno un anno. `"2005-03-01"`, `"c2005"`, `"marzo 2005"` danno 2005.

4. **Risultato vuoto** (`google.rs`, `parse`). Se dall'elemento scelto non esce alcun campo (tutto vuoto tranne `sources`), il risultato è `Ok(None)`, non un `Metadata` vuoto.

5. **Entità** (`google.rs`). La descrizione passa da `strip_html`, quindi dal decodificatore completo.

6. **`<` isolato** (`openlibrary.rs`). `plain_text` usa `strip_html`.

## Test

- Test unitari in `lookup/text.rs`: `a < b e c > d` resta intatto; `<p>uno</p><p>due</p>` → due righe; tag mai chiuso resta testo; `&egrave;`, `&#233;`, `&#xE9;`, `&hellip;`, `&sconosciuta;`.
- `tests/lookup_google.rs`: `year_needs_exactly_four_digits` (i casi del punto 3); `an_item_without_fields_is_no_result`; `description_entities_are_decoded`; `an_oversized_body_is_a_provider_error` (server locale su `127.0.0.1:0` che risponde con 2 MiB).
- `tests/lookup_openlibrary.rs`: `a_bare_less_than_is_kept`; `an_oversized_body_is_a_provider_error`.
- I file di esempio nuovi vanno sotto `tests/fixtures/google` e `tests/fixtures/openlibrary`.

## Acceptance criteria

- `cargo test -p bookeeper-core --lib lookup` e `cargo test -p bookeeper-core --test lookup_google --test lookup_openlibrary --test lookup_api --test lookup_annas` passano.
- `grep -n "fn decode_entities\|fn strip_html\|fn plain_text" crates/bookeeper-core/src/lookup/google.rs crates/bookeeper-core/src/lookup/openlibrary.rs` non trova definizioni di decodifica o pulizia HTML proprie (al più una funzione di una riga che chiama `text::`).
- `grep -n "\.text()" crates/bookeeper-core/src/lookup/google.rs crates/bookeeper-core/src/lookup/openlibrary.rs` non trova nulla.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
- Cambiano solo: `lookup/mod.rs` (una riga), `lookup/text.rs`, `lookup/google.rs`, `lookup/openlibrary.rs`, i due file di test, le due cartelle di esempi.
