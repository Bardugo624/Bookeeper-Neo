Leggi prima `docs/forge/fase-5a/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`. La task `d-where` è già unita: parti dal suo codice. Leggi `apps/desktop/src/modules/shelves` per intero, con i test e `dnd.ts`.

# Desktop: spostare tra mobili e larghezza del dorso

## Cosa fare

1. **Trascinare su un altro mobile**: durante un trascinamento (dal vassoio o da un ripiano) le linguette dei mobili sono bersagli. Fermarsi mezzo secondo su una linguetta apre quel mobile, così si rilascia sul ripiano voluto. Rilasciare sulla linguetta stessa colloca il libro nel primo ripiano con un posto libero (`PUT …/placement` senza `slot_index`, ripiano per ripiano finché uno non risponde `row_full`; se tutti sono pieni, messaggio "Il mobile è pieno").
2. **Da tastiera**: il menu del dorso (`SpineMenu`) offre "Sposta in…", che apre il dialog di collocazione già esistente (`PlaceDialog`) con mobile e ripiano attuali preselezionati. Vale per i libri già collocati come "Colloca in…" vale per gli altri.
3. **Larghezza del dorso**: il menu del dorso offre "Larghezza del dorso" con quattro scelte a radio: "Dalle pagine" (nessun valore), "Sottile" (1), "Medio" (2), "Largo" (3). Scrive `spine_width` con `PUT …/placement` mantenendo la posizione. Il mobile disegna la larghezza scelta; "Dalle pagine" torna al calcolo dal numero di pagine. Guarda come `ShelfCabinet` passa oggi le pagine al dorso e mappa 1, 2, 3 su tre larghezze dentro i limiti di `spineWidth`.
4. Scritture ottimistiche con ripristino in caso d'errore; `slot_taken` e `row_full` hanno un messaggio proprio; dopo ogni scrittura si invalidano mobili, libri del mobile, vassoio, elenco e dettaglio dei libri.
5. Chi non può modificare non vede né bersagli né voci di menu di scrittura.

## Correzione del piano: togliere la larghezza

Il piano dava per scontato che `spine_width: null` togliesse la larghezza. Non è così: il core tratta `null` come "mantieni". Questa task ora cambia anche il core.

- `crates/bookeeper-core/src/api/shelves.rs`, `PlaceIn.spine_width`: tre stati, con lo stesso meccanismo (`present`) che il file usa già per `room_id`. Assente → mantiene. `null` → toglie. 1–3 → imposta. Vale in ogni ramo di `place_book` (con `slot_index`, senza, con `shift`). Uno spostamento che non nomina `spine_width` conserva la larghezza, come oggi.
- Test in `crates/bookeeper-core/tests/shelves_api.rs`: imposta 3, poi `null` → la lettura dà nessuna larghezza; assente → resta 3; spostamento senza il campo → resta 3; 0 e 4 → errore di validazione.
- Rigenera `packages/api/openapi.json` e `packages/api/src/schema.d.ts` con i comandi del repository.
- Nel desktop, "Dalle pagine" manda `spine_width: null`; le altre scritture di posizione non mandano il campo. Il finto core di `testkit.tsx` segue la stessa regola dei tre stati, così il test "Dalle pagine" verifica che la larghezza sparisca davvero dopo il ricaricamento.

## Test

- Sosta sulla linguetta: apre il mobile dopo il ritardo (orologio finto), non prima.
- Rilascio sulla linguetta: primo ripiano libero; secondo ripiano se il primo è pieno; "Il mobile è pieno".
- "Sposta in…": preselezione, spostamento su un altro mobile.
- Larghezza: ogni scelta manda il valore giusto e mantiene la posizione; errore con ripristino.
- Sola lettura: niente bersagli, niente voci.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Nessun componente supera 250 righe. Nessun testo scritto nei componenti.
- `cargo fmt --check`, `cargo test -p bookeeper-core` e `cargo clippy -p bookeeper-core --all-targets -- -D warnings` passano. `npm test -w @bookeeper/api` passa. `npm run typecheck -w @bookeeper/mobile` passa.
- Cambiano solo: file sotto `apps/desktop/src/modules/shelves/`, i file i18n `shelves.json` (it e en), `crates/bookeeper-core/src/api/shelves.rs`, `crates/bookeeper-core/tests/shelves_api.rs`, `packages/api/openapi.json`, `packages/api/src/schema.d.ts`, `packages/api/src/resources.test.ts`.
