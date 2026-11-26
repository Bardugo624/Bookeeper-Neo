Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/src/kit`, il modulo che tocchi e i suoi test. Per il comportamento guarda il modulo corrispondente del desktop: si legge, non si importa. Le task `m-book-edit` e `m-loans` sono già unite. Leggi la pagina "Dov'è?" in `apps/mobile/src/modules/search`.

# PWA: scaffali in sola lettura

## Cosa fare

1. Modulo nuovo `apps/mobile/src/modules/shelves`, senza scheda nella barra:
   - `/shelves`: i mobili raggruppati per stanza, ognuno con il numero di libri.
   - `/shelves/:id`: il mobile disegnato con `ShelfUnit` di `@bookeeper/ui/shelf` in sola lettura; scorre in orizzontale dentro di sé, la pagina no. Il tocco su un dorso apre la scheda del libro.
2. Ingressi: un bottone "Scaffali" nell'intestazione della ricerca; nel blocco "Dove si trova", "Apri il mobile".

## Test

- Elenco per stanza; mobile con i dorsi; tocco su un dorso; nessun gesto di scrittura.
- I due ingressi.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- A 320px nessuno scorrimento orizzontale della pagina; bersagli tattili di almeno 44×44px; campi con testo di almeno 16px.
- Cambiano solo: file sotto `apps/mobile/src/modules/shelves/` (nuovo) e `apps/mobile/src/modules/search/`, i file i18n `mshelves.json` (nuovo) e `msearch.json` (it e en).
