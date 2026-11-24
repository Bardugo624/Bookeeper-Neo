Leggi prima `docs/forge/fase-1c/CONTRATTO.md` e i due contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Lookup: fusione dei fornitori, cache e rotta

## Obiettivo

Implementare `LookupService::lookup` in `crates/bookeeper-core/src/lookup/mod.rs` e la rotta `GET /api/v1/lookup/isbn/{isbn}` in `api/lookup.rs`. I tre fornitori veri li scrivono altre task: qui si lavora con fornitori finti. Riferimento per la parità: `server/internal/lookup/service.go`.

## Regole del servizio

- **Chiamata.** I fornitori sono interrogati tutti insieme, ognuno con un limite di 8 secondi. Un fornitore che fallisce o scade è ignorato; gli altri contano.
- **Fusione.** Per ogni campo scalare vince il primo valore non vuoto, nell'ordine dei fornitori (non nell'ordine di arrivo). `authors`: la prima lista non vuota. `cover_candidates`: l'unione di tutte, nell'ordine dei fornitori, senza doppioni, solo URL `https://`. `sources`: i nomi dei fornitori che hanno contribuito almeno un campo o un candidato, nell'ordine dei fornitori.
- **ISBN.** `isbn_13` del risultato è sempre quello richiesto. Se nessuno dà `isbn_10` e l'ISBN-13 inizia con `978`, calcolalo.
- **Nessun risultato.** Se nessun fornitore dà un titolo → `None`.
- **Cache in memoria**, per ISBN-13: i successi valgono 30 giorni, i "non trovato" 24 ore. Con `fresh = true` la cache non viene letta ma viene riscritta. Se tutti i fornitori hanno fallito (errore, non "nessun risultato"), il "non trovato" **non** va in cache. Al più 5.000 voci: oltre, si eliminano le più vecchie.
- `now` è un parametro: i test controllano il tempo.

## Rotta

`GET /lookup/isbn/{isbn}` (`AuthUser`, ogni ruolo), `fresh=true` facoltativo:
- `{isbn}` può essere ISBN-13 o ISBN-10, con trattini; normalizza con `util::normalize_isbn13` / `normalize_isbn10` (un ISBN-10 valido diventa ISBN-13 con prefisso `978`). Non valido → 422 `validation`.
- trovato → 200 `Metadata`; non trovato → 404 `isbn_not_found`.
- Annota la rotta e registra `Metadata` in `Doc`.

## Test (`crates/bookeeper-core/tests/lookup_api.rs`)

Fornitori finti che contano le chiamate e restituiscono un `Metadata`, `Ok(None)`, un errore, oppure non rispondono mai. Lo stato di prova si costruisce sostituendo `state.lookup` con `Arc::new(LookupService::with_providers(...))`.

- `first_non_empty_field_wins_in_provider_order`: il secondo fornitore risponde per primo ma il titolo è quello del primo.
- `authors_come_from_the_first_non_empty_list`.
- `cover_candidates_are_merged_deduplicated_and_https_only`.
- `sources_lists_contributors_in_provider_order`.
- `failing_and_slow_providers_are_skipped`: uno dà errore, uno non risponde mai (limite accorciato nel test con `tokio::time::pause`), il terzo dà il risultato.
- `no_title_anywhere_is_none`.
- `isbn_10_is_derived_for_978`: `9780306406157` → `0306406152`; per un `979…` resta `None`.
- `positive_results_are_cached_for_thirty_days`: seconda chiamata senza nuove richieste ai fornitori; a 30 giorni + 1 secondo li richiama.
- `negative_results_are_cached_for_a_day`.
- `fresh_bypasses_and_refreshes_the_cache`.
- `total_failure_is_not_cached`: tutti in errore → `None`; alla chiamata dopo i fornitori sono interrogati di nuovo.
- `cache_is_bounded`: dopo 5.001 ISBN diversi, le voci sono 5.000.
- Rotta: `route_returns_metadata`; `route_accepts_isbn_10_and_hyphens`; `route_rejects_bad_checksums` (422); `route_unknown_isbn_is_isbn_not_found`; `route_needs_a_token`; `guest_can_look_up`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test lookup_api` passa con tutti i test elencati, senza accesso alla rete.
- Cambiano solo `lookup/mod.rs`, `api/lookup.rs`, `tests/lookup_api.rs`. Le firme pubbliche del contratto non cambiano.
- La rotta compare in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
