Leggi prima `docs/forge/fase-1b/CONTRATTO.md` e, da lì, `docs/forge/fase-1a/CONTRATTO.md`: regole, errori, oggetti, validazione e rotte valgono anche qui.

# Statistiche della libreria

## Obiettivo

La rotta `GET /api/v1/stats` in `crates/bookeeper-core/src/api/stats.rs`. Sola lettura, ogni ruolo. Non usa gli altri moduli delle risorse: legge le tabelle direttamente.

## Risposta (`Stats`)

```
{
  "overview": { "total_books", "total_authors", "total_shelves", "total_pages",
                "wishlist_count", "active_loans", "overdue_loans", "returned_loans" },
  "by_format":   [ { "key", "count" } ],
  "by_language": [ { "key", "count" } ],
  "by_genre":    [ { "key", "count" } ],
  "by_decade":   [ { "key", "count" } ],
  "additions_by_month": [ { "ym", "count" } ],
  "loans_by_month":     [ { "ym", "lent", "returned" } ],
  "top_authors": [ { "key", "count" } ],
  "shelf_fill":  [ { "id", "name", "color", "capacity", "used", "pct" } ]
}
```

## Regole

- Tutto è limitato alla libreria di chi chiede. `wishlist_count` conta solo le voci di chi chiede.
- `total_authors`: autori distinti su tutti i libri, confrontati senza distinguere maiuscole e dopo `trim` (`json_each(authors_json)`).
- `total_pages`: somma di `page_count`, i `NULL` valgono 0.
- `by_format`, `by_language`, `by_genre`: conteggio per valore, dal più frequente; a parità, per chiave. I libri senza valore finiscono sotto la chiave `""`, sempre in fondo. `by_genre` al più 20 voci, le altre sommate sotto la chiave `"…"`.
- `by_decade`: da `published_year`, chiave `"1980"` per 1980–1989, in ordine di decennio crescente; i libri senza anno sono esclusi.
- `additions_by_month`: gli ultimi 12 mesi di calendario in UTC, compreso quello corrente, dal più vecchio. Sempre 12 voci, anche a zero. `ym` nel formato `YYYY-MM`.
- `loans_by_month`: stessi 12 mesi; `lent` conta per `lent_at`, `returned` per `returned_at`.
- `top_authors`: i 10 autori con più libri, a parità per nome; confronto senza distinguere maiuscole, mostrando la grafia più frequente.
- `shelf_fill`: uno per scaffale, per `label_code`; `used` = libri collocati; `pct` = `used / capacity` tra 0 e 1, arrotondato a 4 decimali.
- A libreria vuota la risposta è completa: contatori a 0, liste vuote, i due elenchi mensili con 12 voci a zero.
- "Ora" viene da `util::now_secs()`. Per poter verificare i mesi nei test, metti il calcolo in una funzione `pub fn compute(conn: &rusqlite::Connection, who: &AuthUser, now: i64) -> rusqlite::Result<Stats>` e fai chiamare quella dalla rotta.
- Un numero di query fisso, indipendente da quanti libri ci sono: niente query dentro un ciclo sui libri.

`Stats` e i tipi che contiene sono `pub` e registrati in `Doc`.

## Test (`crates/bookeeper-core/tests/stats_api.rs`)

Usa `mod common;`. Inserisci i dati con SQL diretto, con date esplicite, e chiama `compute` con un `now` fisso (per esempio 2026-03-15T12:00:00Z) dove servono i mesi.

- `empty_library_is_all_zeros_with_twelve_months`.
- `overview_counts`: libri, pagine (con un `NULL`), scaffali, prestiti attivi, scaduti, restituiti.
- `authors_are_distinct_ignoring_case_and_spaces`: `"Umberto Eco"`, `" umberto eco "` e `"Italo Calvino"` → 2.
- `wishlist_count_is_personal`.
- `by_format_orders_by_count_and_puts_missing_last`.
- `by_genre_caps_at_twenty_and_sums_the_rest`: 23 generi → 21 voci, l'ultima `"…"` con la somma dei tre meno frequenti.
- `by_decade_buckets_and_skips_missing_years`: 1980, 1989, 1990 → `1980: 2`, `1990: 1`.
- `additions_by_month_covers_the_last_twelve_months`: con `now` a marzo 2026, la prima voce è `2025-04` e l'ultima `2026-03`; un libro di febbraio 2025 non compare; un libro del 2026-03-01T00:00:00Z conta in marzo.
- `loans_by_month_counts_lent_and_returned_separately`.
- `top_authors_is_capped_at_ten_and_ordered`.
- `shelf_fill_percentages`: 3 libri su uno scaffale 2×5 → `used: 3`, `pct: 0.3`; uno scaffale vuoto → 0.
- `never_counts_another_library`: una seconda libreria piena non cambia nessun numero.
- `guest_can_read`; `needs_a_token`.
- `route_returns_the_same_shape`: `GET /api/v1/stats` ha tutte le chiavi di primo livello.

## Acceptance criteria

- `cargo test -p bookeeper-core --test stats_api` passa con tutti i test elencati.
- Solo `api/stats.rs` e `tests/stats_api.rs` sono cambiati.
- La rotta compare in `bookeeper_core::openapi()`.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` è pulito.
