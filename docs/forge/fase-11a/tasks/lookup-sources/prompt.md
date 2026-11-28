Leggi prima `docs/forge/fase-11a/CONTRATTO.md`.

# Ricerca ISBN: le fonti SBN e Library of Congress

## File
`crates/bookeeper-core/src/lookup/` (due fonti nuove, `sbn.rs` e `loc.rs`, e la loro registrazione); i test `crates/bookeeper-core/tests/lookup_sbn.rs` e `lookup_loc.rs`.

## Cosa fare
- Due `Provider` nuovi come dice il contratto, sul modello di `openlibrary.rs`: indirizzo base configurabile per i test, corpo al massimo 1 MiB, errori come `ProviderError`.
- `LookupService::new` le usa nell'ordine del contratto.
- I test usano un server finto con risposte registrate da veri record. Per SBN, il record di 9788804739494. Per la Library of Congress, un MODS con autore, editore, anno, pagine e lingua.

## Test
- `sbn_reads_title_subtitle_author_publisher_and_year`.
- `sbn_without_a_record_is_empty`.
- `loc_tries_isbn10_when_isbn13_is_unknown`.
- `loc_reads_the_mods_fields`.

## Acceptance criteria
- `cargo test -p bookeeper-core --test lookup_sbn --test lookup_loc` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
