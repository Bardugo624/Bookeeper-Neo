Leggi prima `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit`, il modulo che tocchi e i suoi test.

# Storico prestiti e nomi suggeriti

## Cosa fare

1. **Storico**: la vista "Restituiti" diventa uno storico leggibile: raggruppato per mese di restituzione, con durata del prestito in giorni e, per i restituiti in ritardo, di quanto. In testa un riepilogo: prestiti chiusi, durata media, persona a cui hai prestato più spesso. Ricerca per persona o titolo sui dati caricati.
2. **Per persona**: toccando un nome (in qualunque card) si filtrano i prestiti di quella persona (`?borrower=<nome>` nell'indirizzo, confronto senza maiuscole), in corso e chiusi.
3. **Nomi suggeriti**: nel modulo "Nuovo prestito" e in `LendDialog`, il campo della persona suggerisce i nomi già usati (`GET /loans/borrowers?q=`, ritardo 200 ms) in un elenco navigabile da tastiera (combobox); scegliere un nome lo inserisce; scrivere un nome nuovo resta possibile.
4. `/loans?new=1` apre "Nuovo prestito" (serve alla palette dei comandi).

## Test

- Storico: gruppi per mese in ordine, durata, ritardo; riepilogo con media e persona più frequente; nessun prestito chiuso → stato vuoto.
- Filtro per persona dall'indirizzo e dal tocco, senza maiuscole.
- Suggerimenti: richiesta dopo il ritardo, frecce e Invio, nome nuovo accettato, nessun suggerimento → nessun elenco.
- `?new=1`.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/loans/`, i file i18n `loans.json`.
