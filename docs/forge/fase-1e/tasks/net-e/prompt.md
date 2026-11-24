Leggi prima `docs/forge/fase-1e/CONTRATTO.md` e i quattro contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# mDNS: `url` troppo lungo omesso

## Obiettivo

Correggere un difetto P3 trovato dal revisore nel run 1D.

File: `crates/bookeeper-net/src/mdns.rs`.

`mdns-sd` tronca ogni voce TXT oltre i 255 byte. Un `url` lungo viene pubblicato tagliato, spesso ancora UTF-8 valido, e `browse` consegna al client un indirizzo rotto.

## Cosa fare

- `txt_records` omette la voce `url` quando `"url=".len() + url.len()` supera 255 byte. Usa la costante `MAX_TXT_VALUE_BYTES` già presente nel file.
- Le altre voci (`v`, `tls`, `path`) non cambiano.
- `sanitize_instance` resta `pub`: un'altra task la usa.

## Test

Nel modulo di test del file (segui la forma dei test esistenti):

- `a_long_url_is_left_out`: con `url = "https://example.org/" + "a" × 300`, `txt_records` non contiene alcuna voce `url`.
- `a_url_at_the_limit_is_kept`: con un `url` tale che `"url=" + url` misura esattamente 255 byte, la voce è presente e intatta.
- `a_url_one_byte_over_is_left_out`: con 256 byte la voce manca.

## Acceptance criteria

- `cargo test -p bookeeper-net` passa.
- `cargo clippy -p bookeeper-net --all-targets -- -D warnings` passa.
- Cambia solo `crates/bookeeper-net/src/mdns.rs`.
