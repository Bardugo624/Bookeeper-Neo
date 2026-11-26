# Contratto del run 5A

Valgono per intero `docs/forge/fase-2a/CONTRATTO.md`, `docs/forge/fase-2a/MOCKUP.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md`. Qui ci sono solo le aggiunte.

## Regole aggiunte

- Nessuna dipendenza nuova, né npm né Rust. Nessuna libreria di animazione o di trascinamento.
- Ogni task tocca solo i file dichiarati. Le task delle app non toccano il core, `packages/api`, `packages/ui`: se manca qualcosa, la task si ferma e lo dice.
- Ogni gesto di trascinamento ha un'alternativa da tastiera che fa la stessa cosa.
- Movimento: solo `transform` e `opacity`, con i token di durata e curva di `packages/ui/src/tokens.css`. Con `prefers-reduced-motion: reduce` niente spostamento né pulsazione: resta un contorno fermo.
- Nomi: nell'interfaccia italiana "mobile" (l'unità), "ripiano" (la riga), "posto" (lo slot). Ripiani e posti si mostrano a partire da 1; l'API li conta da 0.
- I nomi dei file di test hanno le stesse maiuscole del file che provano. Nessun colore letterale nei fogli di stile. Rust: `cargo fmt --check` passa.

## API (da `core-append`)

`PUT /api/v1/books/{id}/placement`, corpo `PlaceIn`: `slot_index` diventa facoltativo.

- Con `slot_index`: comportamento attuale, invariato.
- Senza `slot_index`: il libro va nel primo posto libero dopo l'ultimo occupato del ripiano (`max(slot_index) + 1`, oppure 0 a ripiano vuoto). Se il libro è già su quel ripiano, resta dov'è e la risposta dà la sua posizione. `shift` senza `slot_index` è un errore di validazione.
- Ripiano senza posti dopo l'ultimo occupato: `409` con `error_code` `row_full`.
- La risposta contiene sempre `row_index` e `slot_index` effettivi. Tutto in una transazione, con la riga di audit di sempre.

Nel client: `PlaceIn.slot_index` facoltativo; nessun metodo nuovo.

`PlaceIn.spine_width` (da `d-move`): assente mantiene la larghezza salvata; `null` la toglie (il dorso torna alla larghezza dalle pagine); 1–3 la imposta.

## `packages/ui/shelf` (da `ui-pull`)

- `ShelfUnit` e `ShelfBand` accettano `pulledId?: string`: quel dorso si sfila verso chi guarda (traslazione verso il basso e leggera scala) e pulsa tre volte, poi resta sfilato. Indipendente da `selectedId`.
- `Spine` espone `data-pulled="true"` sul dorso sfilato.
- `positionLabel({ row, slot })`: nessun testo; le app compongono la frase con i18n.
- Uso in sola lettura: senza gestori di trascinamento il mobile non offre gesti e i dorsi non sono trascinabili (esiste già: va solo garantito da un test).

## Indirizzi

- Desktop: `/shelves?unit=<id>&book=<id>` sfila il dorso e mostra la frase della posizione (esiste l'evidenziazione: si estende).
- PWA: `/books/:id/where` mostra il mobile con il dorso sfilato; `/scan/shelf` avvia scan-a-scaffale.
