Leggi prima `docs/forge/fase-4c1/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md` e `docs/forge/fase-3a/CONTRATTO.md`. Leggi ogni file citato e i suoi test prima di cambiarlo.

# PWA: difetti P3 del run 4C

1. `apps/mobile/src/modules/search/SearchPage.tsx` (riga del conteggio): un elenco ristretto per stato di lettura, tag o stanza è ancora intitolato "Ultimi libri aggiunti · N libri". Regola: quel titolo solo senza testo e senza alcun filtro; altrimenti solo il conteggio. Usa il valore `filtered` già calcolato nel file.
2. `apps/mobile/src/modules/search/FilterSheet.tsx`: la sezione dello stato di lettura appare solo dopo `GET /books/facets`. Se la chiamata fallisce, gli stati non si possono scegliere. Regola: i cinque stati ci sono sempre; i conteggi si mostrano quando ci sono. Tag e stanze, che dipendono dal server, mostrano l'errore con "Riprova" nella loro sezione.
3. `apps/mobile/src/modules/search/useFilterData.ts`: `keepPreviousData` lascia il numero vecchio su "Mostra N libri" dopo un cambio di scelta. Regola: finché il conteggio nuovo non arriva, il bottone dice "Mostra i libri" senza numero; resta toccabile.
4. `apps/mobile/src/modules/search/FilterBar.tsx`: i filtri rapidi sono `role="tab"` in un `tablist`, ma due possono essere attivi insieme. Regola: un gruppo (`role="group"` con nome accessibile) di bottoni con `aria-pressed`. Aggiorna i test che cercavano le schede.
5. `apps/mobile/src/modules/tags/useTagsEditor.ts`: `canCreate` e `leastUsedColor` lavorano su `tags.data ?? []` anche quando l'elenco dei tag non è caricato o è fallito. Regola: "Crea «testo»" si offre solo a elenco caricato; a elenco fallito il foglio mostra l'errore con "Riprova".

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Nessun testo scritto nei componenti. Bersagli tattili di almeno 44×44px.
- Cambiano solo: file sotto `apps/mobile/src/modules/search/`, `apps/mobile/src/modules/tags/`, i file i18n `msearch.json` e `mtags.json` (it e en).
