# Contratto del run 4C

Valgono per intero `docs/forge/fase-2a/CONTRATTO.md`, `docs/forge/fase-2a/MOCKUP.md`, `docs/forge/fase-3a/CONTRATTO.md` (regole della PWA) e `docs/forge/fase-4b/CONTRATTO.md` (desktop). Rotte e tipi sono quelli di `docs/forge/fase-4a/CONTRATTO.md`, già nel client `@bookeeper/api`. Qui ci sono solo le aggiunte.

## Regole aggiunte

- Nessuna dipendenza nuova, né npm né Rust.
- Le task della PWA non toccano `apps/desktop`, `packages/ui`, `packages/api` né il core. Se manca qualcosa, la task si ferma e lo dice.
- La PWA non importa nulla da `apps/desktop`. L'anello è `ProgressRing` di `@bookeeper/ui/book`; le etichette colorate sono `Tag` di `@bookeeper/ui/base`; i colori dei tag vengono da `SHELF_COLORS` di `@bookeeper/ui/shelf`.
- Lo stato di lettura è personale: ogni membro vede e scrive il proprio, anche chi non può modificare i libri. I tag di un libro li cambia solo chi può modificare i libri; gli altri li vedono.
- Dopo ogni scrittura si invalidano le query toccate: elenco, dettaglio, faccette.
- Le task che toccano `apps/mobile/src/modules/search` vanno in fila (`m-reading` → `m-tags` → `m-filters`): ognuna parte dal lavoro della precedente e non riscrive ciò che funziona.
- I nomi dei file di test hanno le stesse maiuscole del file che provano (`Foo.tsx` → `Foo.test.tsx`). Nessun colore letterale nei fogli di stile: solo token di `packages/ui/src/tokens.css`.

## Punti di contatto della PWA

- `apps/mobile/src/modules/reading` esporta da `index.ts`: `ReadingBlock` (`{ book }`), `ReadingBadge` (`{ reading, pageCount }`), `useReading(bookId)`, `READING_STATUSES`. Non ha `routes.tsx`: è una cartella di componenti, non un modulo con pagine.
- `apps/mobile/src/modules/tags` esporta: `TagsBlock` (`{ book }`), `useTags()`. Non ha `routes.tsx`.
- Spazi dei nomi i18n: `mreading`, `mtags`, `msearch`.

## Indirizzi della ricerca nella PWA

`/search?q=…&filter=all|loan|unshelved&reading=<stato>&tag=<id>&tag=<id>&room=<id>`. Valori sconosciuti si ignorano. Tornando dalla scheda si ritrova lo stesso elenco.
