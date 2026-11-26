Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/src/kit`, il modulo che tocchi e i suoi test. Per il comportamento guarda il modulo corrispondente del desktop: si legge, non si importa.

# PWA: scheda modificabile, di chi è, chi lo legge

## Cosa fare

1. **Scheda** (`BookDetailPage`): la riga "Di chi è" (assente se il libro è di tutti) e il blocco "Chi lo legge" con le frasi del desktop. In alto, "Modifica" per chi può modificare i libri.
2. **Pagina `/books/:id/edit`**: titolo (obbligatorio), sottotitolo, autori (uno per riga, con "Aggiungi autore"), editore, anno, pagine, lingua, genere, formato (scelta), "Di chi è" (persone di `GET /users`). Tastiera numerica per anno e pagine.
3. "Salva" manda `PATCH /books/{id}` con i soli campi cambiati. Gli errori 422 vanno sul campo. Dopo il salvataggio si torna alla scheda aggiornata.
4. Tornare indietro con modifiche non salvate chiede conferma in un `BottomSheet`.

## Test

- Scheda: riga e blocco presenti e assenti; "Modifica" solo con il permesso.
- Pagina: campi precompilati; corpo con i soli campi cambiati; errore sul campo; conferma all'uscita; ritorno alla scheda.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- A 320px nessuno scorrimento orizzontale della pagina; bersagli tattili di almeno 44×44px; campi con testo di almeno 16px.
- Cambiano solo: file sotto `apps/mobile/src/modules/search/`, i file i18n `msearch.json` (it e en).
