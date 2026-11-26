Leggi prima `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit`, il modulo che tocchi e i suoi test.

# Stanze negli Scaffali

## Cosa fare

1. **Raggruppamento**: le schede dei mobili si raggruppano per stanza, con il nome della stanza come intestazione di gruppo; i mobili senza stanza stanno sotto "Senza stanza", in fondo. Con una sola stanza o nessuna, niente intestazioni. Il pannello del mobile mostra la stanza.
2. **Gestione**: "Stanze…" accanto a "Nuovo mobile" apre un dialog con l'elenco (nome, numero di mobili), aggiunta, rinomina in linea, eliminazione con conferma che dice che i mobili restano senza stanza. Errori `room_exists` e di convalida accanto al campo.
3. **Modulo del mobile**: campo "Stanza" (`Select` con le stanze, "Nessuna", e "Nuova stanza…" che la crea al volo).
4. `?room=<id>` nell'indirizzo mostra solo i mobili di quella stanza.
5. Solo chi può scrivere vede gestione e campo.

## Test

- Raggruppamento con due stanze e un mobile senza stanza; nessuna intestazione con una sola stanza.
- Gestione: crea, rinomina, doppione → messaggio, elimina con conferma.
- Modulo: scelta, "Nessuna" manda `room_id: null`, creazione al volo.
- `?room=`.
- Senza permesso: nessun controllo di scrittura.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/shelves/`, i file i18n `shelves.json`.
