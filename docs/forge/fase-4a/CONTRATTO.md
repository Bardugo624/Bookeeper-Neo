# Contratto del run 4A

Valgono regole, convenzioni ed errori dei contratti della fase 1 (`docs/forge/fase-1a` … `fase-1e`). Qui ci sono solo le aggiunte. Dove i file divergono, vince questo.

## Regole aggiunte

- Tocca solo i file dichiarati per la tua task. Se ne serve un altro, fermati e dillo.
- Nessuna dipendenza nuova. Nessuna modifica a `Cargo.toml`.
- **Schema**: `0001_schema.sql` NON si modifica. Solo `reading-api` aggiunge una migrazione, `0002_reading_progress.sql`. Le tabelle `reading`, `tags`, `book_tags`, `rooms`, `audit_log` esistono già: leggile in `0001_schema.sql`.
- Convenzioni di sempre: `/api/v1`, JSON `snake_case`, UUID v7, secondi unix, errori `{error_code, message}`, `ApiJson`/`ApiQuery`, `db.run`, audit nella stessa transazione, isolamento per libreria (ciò che è di un'altra libreria risponde 404), ruoli letti da `guard`.
- Ogni rotta nuova è documentata con `utoipa` e registrata in `openapi.rs` e in `api/mod.rs`, con le risposte d'errore che può dare.
- L'istantanea `packages/api/openapi.json` la rigenera solo `client-4a`. Le altre task non la toccano.
- Compatibilità: i campi nuovi nelle risposte sono aggiunte; i parametri nuovi sono facoltativi; senza di essi le rotte esistenti si comportano come prima. I test esistenti restano verdi senza modifiche, salvo dove un campo aggiunto cambia un confronto esatto.
- Formatta solo i tuoi file con `rustfmt --edition 2021`.

## Ruoli

Lettura: ogni membro. Scrittura di tag, stanze e assegnazioni: lo stesso ruolo che può modificare un libro. Lo stato di lettura è **personale**: ogni membro scrive il proprio, compreso un ospite, e nessuno legge quello di un altro. Registro attività: solo proprietario e admin.

## Stato di lettura (`reading-api`)

Migrazione `0002`: `ALTER TABLE reading ADD COLUMN current_page INTEGER CHECK (current_page IS NULL OR current_page >= 0)`.

```
ReadingOut { book_id, status, started_at, finished_at, rating, note, current_page, updated_at }
status: "to_read" | "reading" | "read" | "abandoned"
```

| Metodo e percorso | Effetto |
| --- | --- |
| `GET /books/{id}/reading` | lo stato di chi chiama; 404 `not_found` se il libro non esiste, 200 con `null` se non c'è stato |
| `PUT /books/{id}/reading` | crea o sostituisce; corpo `{status, started_at?, finished_at?, rating?, note?, current_page?}` |
| `DELETE /books/{id}/reading` | 204, anche se non c'era |
| `GET /reading?status=&limit=&offset=` | gli stati di chi chiama con `{book: {id, title, authors, cover_color, page_count}}`, ordinati per `updated_at` decrescente |

Regole: `rating` 1..5; `note` al più 2.000 caratteri; `finished_at >= started_at`; `current_page` non oltre `page_count` del libro quando è noto; passando a `reading` senza `started_at` si usa adesso; passando a `read` senza `finished_at` si usa adesso e `current_page` diventa `page_count` se noto; passando a `to_read` si azzerano date e pagina.

`BookOut` guadagna `reading: ReadingSummary | null` con `{status, current_page, rating}` di chi chiama, nell'elenco, nella ricerca e nel dettaglio. Backup e ripristino comprendono `reading` con `current_page`.

## Tag (`tags-api`)

```
TagOut { id, name, color, book_count }      // color: uno dei colori degli scaffali
```

`GET /tags`, `POST /tags`, `PATCH /tags/{id}`, `DELETE /tags/{id}` (toglie anche le assegnazioni), `PUT /books/{id}/tags` con `{tag_ids: [..]}` (sostituisce l'insieme; al più 20). Nome 1..40 caratteri, unico nella libreria senza distinguere le maiuscole: doppione → 409 `tag_exists`. `BookOut` guadagna `tags: [{id, name, color}]`, ordinati per nome.

## Stanze (`rooms-api`)

```
RoomOut { id, name, shelf_count, created_at }
```

`GET /rooms`, `POST /rooms`, `PATCH /rooms/{id}`, `DELETE /rooms/{id}` (gli scaffali restano, senza stanza). Nome 1..60, unico nella libreria: doppione → 409 `room_exists`. `NewShelf` e `ShelfPatch` accettano `room_id` (`null` toglie la stanza; id di un'altra libreria o inesistente → 404). `ShelfOut` guadagna `room: {id, name} | null`.

## Filtri (`filters-api`)

Parametri facoltativi nuovi di `GET /books` e della ricerca, combinati in AND:

`reading` (`to_read|reading|read|abandoned|none`), `tag_id` (ripetibile: il libro ha tutti i tag indicati), `room_id`, `year_from`, `year_to`, `acquired_from`, `acquired_to`, più quelli esistenti (`genre`, `language`, `format`, `shelf_id`, `unshelved`, `on_loan`). `genre` e `language` confrontano senza distinguere le maiuscole.

Ordinamenti (`sort`): quelli esistenti più `author`, `published_year`, `acquired_at`, `page_count`, `progressive_number`, `rating` (di chi chiama). Con `order=asc|desc`; i valori assenti vanno sempre in fondo.

`GET /books/facets` → `{genres: [{value, count}], languages, formats, years: {min, max}, tags: [{id, name, color, count}], rooms: [{id, name, count}], shelves: [{id, name, count}], reading: {to_read, reading, read, abandoned, none}}`, sui libri della libreria.

## Registro attività (`audit-api`)

`GET /audit?user_id=&device_id=&action=&entity_type=&from=&to=&limit=&offset=` → `{items: [AuditOut], total}`, dal più recente. `AuditOut { id, at, action, entity_type, entity_id, user: {id, display_name} | null, device: {id, name} | null, detail }`. `ip` NON è esposto. `GET /audit/actions` → i valori distinti di `action` presenti. `limit` al più 200.

`GET /loans/borrowers?q=` → al più 10 nomi già usati nei prestiti della libreria, i più recenti prima, filtrati per prefisso senza distinguere le maiuscole.

## Statistiche di lettura (`reading-stats`)

`GET /stats/reading?year=` (di chi chiama) → `{years: [{year, books, pages}], year: {year, books, pages, by_month: [12 numeri], by_genre: [{value, count}], days: [{date: "aaaa-mm-gg", books}], rated: {count, average}, longest: {book_id, title, page_count} | null}}`. Conta i libri con stato `read` e `finished_at` in quell'anno; senza `year` si usa l'anno corrente del server in UTC. Le pagine sommano `page_count` quando noto.
