Leggi prima `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/src/kit`, `apps/mobile/src/modules/search` e i suoi test. Per il comportamento guarda il corrispondente desktop (`apps/desktop/src/modules/reading`, `apps/desktop/src/modules/tags`, `apps/desktop/src/modules/books`): si legge, non si importa.

La task `m-reading` è già unita: parti dal suo codice.

# PWA: tag

## Cosa fare

1. Cartella nuova `apps/mobile/src/modules/tags` con i punti di contatto del contratto.
2. **Scheda del libro**: blocco "Tag" dopo "Lettura". Mostra i tag del libro come etichette colorate (colore da `SHELF_COLORS`, con il nome sempre leggibile). Toccare un tag apre la ricerca filtrata (`/search?tag=<id>`). Senza tag e senza permesso di modifica, il blocco non si mostra.
3. **Assegnazione** (solo chi può modificare i libri; guarda come la PWA e il desktop leggono il ruolo dalla sessione): bottone "Modifica tag" che apre un `BottomSheet` con l'elenco dei tag della libreria a caselle di spunta, un campo per filtrare e la riga "Crea «testo»" quando nessun tag ha quel nome (confronto senza maiuscole; colore iniziale: il primo di `SHELF_COLORS` meno usato). "Salva" manda `PUT /books/{id}/tags` una sola volta con l'insieme finale.
4. Errori con `apiErrorMessage`; dopo un errore il foglio resta aperto con le scelte fatte.
5. Rinominare, ricolorare ed eliminare i tag resta al desktop.

## Test

- Blocco: con tag, senza tag con permesso, senza tag senza permesso.
- Foglio: spunta e togli, filtro, crea un tag nuovo e assegnalo, salva con un solo `PUT`, errore che lascia aperto.
- Tocco su un tag: va alla ricerca con `tag=<id>`.
- Membro senza permesso: nessun bottone di modifica.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- A 320px di larghezza nessuno scorrimento orizzontale; bersagli tattili di almeno 44×44px; campi con testo di almeno 16px.
- Cambiano solo: file sotto `apps/mobile/src/modules/tags/`, `apps/mobile/src/modules/search/`, i file i18n `mtags.json` e `msearch.json` (it e en).
