Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit` e il modulo che tocchi, con i test. Leggi in `apps/desktop/src/modules/books`: `BookFormFields.tsx`, `bookFormModel.ts`, `DetailAside.tsx`, `FiltersDrawer.tsx`, `FilterGroups.tsx`, `filterModel.ts`, `ActiveFilters.tsx`, `listParams.ts`, `useSavedViews.ts`, con i test.

# Desktop: di chi è, chi lo legge

## Cosa fare

1. **Modulo del libro**: campo "Di chi è", una scelta tra "Di tutti" e le persone di `GET /users` ("Tu" per sé). Vale in creazione e in modifica; scrive `owner_user_id`.
2. **Scheda**, colonna laterale: la riga "Di chi è: Marco" (assente se il libro è di tutti) e il blocco "Chi lo legge" con i lettori di `listReaders`: "Marco · sta leggendo", "Anna · l'ha letto a marzo 2026", "Tu · da leggere", "Luca · l'ha lasciato". Il blocco non si mostra se nessuno ha uno stato.
3. **Filtri**: sezione "Di chi è" nel pannello filtri con "I miei", "Di tutti" (nessun proprietario) e le persone delle faccette, con i conteggi. Indirizzo `?owner=`. Etichetta nei filtri attivi. Le viste salvate la conservano come gli altri filtri.
4. Nessuna colonna nuova nella tabella.

## Test

- Modulo: creare con proprietario, cambiarlo, toglierlo.
- Scheda: con e senza proprietario; lettori con le quattro frasi e "Tu"; blocco assente senza lettori.
- Filtri: dall'indirizzo e dal pannello; conteggi; etichetta attiva e rimozione; vista salvata.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- Cambiano solo: file sotto `apps/desktop/src/modules/books/`, i file i18n `books.json` (it e en).
