Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e i contratti della fase 1 che riguardano i file che tocchi. Ogni correzione ha un test che fallisce prima e passa dopo.

# Core: colore del segnaposto e spostamento atomico sul ripiano

Unica task del run che modifica il core. Leggi `crates/bookeeper-core/src/api/books.rs`, `shelves.rs`, i loro test e i contratti `docs/forge/fase-1b/CONTRATTO.md` e `fase-1c/CONTRATTO.md` (convenzioni, audit nella stessa transazione, isolamento per libreria).

## 1. `cover_color` scrivibile

Oggi `cover_color` è solo in lettura (lo imposta il caricamento della copertina). Il client deve poter scegliere il colore del segnaposto di un libro senza copertina.

- `CreateBook` e `PatchBook` accettano `cover_color`: stringa `#rrggbb` (sei cifre esadecimali, salvata in minuscolo) oppure `null` per toglierlo. Altro formato: 422 `validation`.
- In `PatchBook` il campo assente non cambia nulla; `null` lo azzera (stessa convenzione degli altri campi annullabili del file).
- Caricare o recuperare una copertina continua a sovrascrivere `cover_color` come oggi. Rimuovere la copertina lo azzera, come oggi: `covers.rs` e i suoi test NON si modificano.

## 2. Spostamento atomico

Oggi riordinare un libro in un ripiano pieno richiede al client più chiamate (`DELETE` e `PUT`), e un fallimento a metà lascia il libro fuori dallo scaffale. Aggiungi a `PlaceIn` (corpo di `PUT /api/v1/books/{id}/placement`) il campo facoltativo `shift: bool` (predefinito `false`: comportamento di oggi, invariato).

Con `shift: true`, in una sola transazione:

- il libro viene tolto dalla sua posizione attuale, se ne ha una;
- nel ripiano di destinazione i libri dalla posizione `slot_index` in poi scorrono di un posto verso destra fino al primo posto libero; se il libro veniva dallo stesso ripiano, il suo vecchio posto conta come libero;
- il libro prende `slot_index`;
- se non c'è un posto libero a destra nel ripiano (ripiano pieno e il libro non ne faceva già parte): 409 `row_full`, nulla cambia;
- `slot_index` oltre l'ultimo posto: 422 `validation` come oggi;
- `spine_width` del libro spostato resta quello che aveva se il corpo non lo indica;
- una voce di audit per l'operazione, nella stessa transazione.

Attenzione al vincolo di unicità sul posto: aggiorna in un ordine che non lo violi (dal fondo verso l'inizio) o usa lo stesso accorgimento già presente nel file.

## 3. Istantanea e client

`UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi -- --include-ignored`; `npm ci`; `npm run gen -w @bookeeper/api`. In `packages/api/src/resources/` i tipi `PlaceIn`, `CreateBook`, `PatchBook` espongono i campi nuovi; nessuna funzione nuova.

## Test

`crates/bookeeper-core/tests/books_api.rs`: creazione con `cover_color`; maiuscole salvate in minuscolo; formati non validi (`red`, `#fff`, `#gggggg`, senza `#`) → 422; `PATCH` con valore, con `null`, senza campo.

`crates/bookeeper-core/tests/shelves_api.rs`:

- `shift_inserts_and_moves_the_rest`: ripiano con 3 libri in 0..2 e 5 posti; nuovo libro in 0 con `shift` → ordine nuovo, vecchi in 1..3.
- `shift_reorders_inside_a_full_row`: ripiano pieno; l'ultimo va in 0; e il primo va in fondo.
- `shift_into_a_full_row_from_outside_is_row_full`: 409 e nulla cambia.
- `shift_uses_the_first_gap`: un buco in mezzo ferma lo scorrimento.
- `shift_between_rows_and_shelves`.
- `shift_keeps_the_spine_width`.
- `without_shift_nothing_changes`: i test esistenti restano verdi; posto occupato senza `shift` dà l'errore di oggi.
- `shift_is_scoped_to_the_library`: libro o mobile di un'altra libreria → 404.
- `shift_writes_one_audit_entry`.

## Acceptance criteria

- `cargo test -p bookeeper-core --test books_api --test shelves_api --test openapi --test openapi_errors -- --include-ignored` passa.
- `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passa.
- `npm run gen -w @bookeeper/api` non produce differenze dopo il commit; `npm test -w @bookeeper/api` e `npm run typecheck` dalla radice passano.
- Cambiano solo: `crates/bookeeper-core/src/api/books.rs`, `crates/bookeeper-core/src/api/shelves.rs`, `crates/bookeeper-core/tests/books_api.rs`, `crates/bookeeper-core/tests/shelves_api.rs`, `packages/api/openapi.json`, `packages/api/src/schema.d.ts`, `packages/api/src/resources/shelves.ts`, `packages/api/src/resources/books.ts`, `packages/api/src/resources.test.ts`.
