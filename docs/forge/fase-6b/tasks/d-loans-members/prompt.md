Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit` e il modulo che tocchi, con i test.

# Desktop: prestiti a membri

## Cosa fare

1. `BorrowerInput` (nuovo prestito e `LendDialog`): i suggerimenti mostrano prima le persone della libreria (da `GET /users`, con un'icona di persona; "Tu" per sé), poi i nomi già usati. Una persona già proposta non si ripete tra i nomi. Scegliere una persona imposta `borrower_user_id`; scrivere un nome libero lo toglie.
2. Card del prestito: con `borrower`, il nome attuale della persona e l'icona; altrimenti `borrower_name`, come oggi. Il tocco sul nome filtra come oggi.
3. Scheda "Prestati a me" (`/loans?mine=1`, cioè `borrower_user_id=me`): c'è solo se esiste almeno un prestito, aperto o chiuso, fatto a chi chiama.
4. Modifica di un prestito: la persona si cambia o si toglie come il nome.

## Test

- Suggerimenti misti e senza doppioni; scelta di una persona → corpo con `borrower_user_id`; nome libero → senza.
- Card con persona e con nome; scheda "Prestati a me" presente e assente; modifica.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- Cambiano solo: file sotto `apps/desktop/src/modules/loans/`, i file i18n `loans.json` (it e en).
