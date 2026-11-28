Leggi prima:
- `docs/forge/fase-10a1/CONTRATTO.md`;
- `docs/forge/fase-10a/CONTRATTO.md`;
- `DESIGN.md`, la parte «Zona pericolosa».

# Computer: la scheda del libro e l'importazione

## File
- `apps/desktop/src/modules/books/`.
- `packages/i18n/src/locales/{it,en}/books.json` e `ebooks.json`.

## Cosa fare
1. **La scheda alla finestra minima.**
   - Oggi a 960 px la colonna centrale di `BookDetailPage` è larga 112 px. La griglia è di 240 px, poi la colonna centrale, poi 232 px.
   - Il titolo va a capo parola per parola. Il nome del file va a capo lettera per lettera, e «Togli il file» esce dalla scheda.
   - Quando la colonna centrale scenderebbe sotto 360 px, la colonna di destra va sotto quella centrale. La copertina resta a sinistra.
   - A 1280 px resta la griglia a tre colonne.
2. **Il rosso solo nella conferma.** «Togli il file» è un pulsante neutro, senza `tone="danger"`. Il pop-up di conferma resta rosso.
3. **Il blocco «File» respira.** Fra la riga dei dati (Pagine, Lingua, ISBN) e il blocco «File» ci sono 24 px.
4. **L'errore giusto.** In `bookFileApi.ts` solo `error_code === 'drm_protected'` dà il messaggio sul DRM. Un altro 422 mostra il messaggio dell'API.
5. **Il pulsante dell'importazione dice cosa fa.**
   - Quando alcune righe si attaccano a un libro che c'è già, il pulsante conta i libri nuovi e i file attaccati.
   - In italiano: «Aggiungi 1 libro», «Attacca 1 file», «Aggiungi 2 libri e attacca 1 file».
   - In inglese: «Add 1 book», «Attach 1 file», «Add 2 books and attach 1 file».
   - Con i plurali giusti nelle due lingue.
6. **L'invito a rilasciare sta dentro la cornice.** L'etichetta «Rilascia gli e-book…» non tocca la cornice tratteggiata: ne sta ad almeno 16 px, su uno sfondo suo.
7. **L'anello della copertina.** `BookCard` usa `reading.progress_percent` quando c'è, come la scheda.

## Test
- La griglia: una classe o un attributo che la scheda prende sotto la soglia, con un test che lo controlla.
- «Togli il file» non ha il tono di pericolo; la conferma sì.
- Il 422 di validazione mostra il messaggio dell'API.
- Il pulsante dell'importazione, nei tre casi del punto 5.
- `BookCard` con `progress_percent: 37` mostra 37%.

## Acceptance criteria
- `npm run typecheck -w @bookeeper/desktop` passa.
- `npx vitest run src/modules/books src/kit/styles.test.ts src/kit/translationKeys.test.ts` (da `apps/desktop`) passa.
- `npx vitest run src/caseCollisions.test.ts` (da `packages/ui`) passa.
- `impeccable detect --json` pulito sui file cambiati.
