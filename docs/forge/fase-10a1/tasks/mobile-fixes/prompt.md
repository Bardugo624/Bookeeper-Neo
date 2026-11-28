Leggi prima `docs/forge/fase-10a1/CONTRATTO.md` e `docs/forge/fase-10a/CONTRATTO.md`.

# Telefono: l'anello resta

## File
- `apps/mobile/src/modules/reading/`.

## Cosa fare
1. **L'anello non sparisce quando si scrive la pagina.**
   - Oggi, su un libro senza `page_count` e con una percentuale presa dal file, l'anello sparisce quando la persona scrive una pagina, e torna quando risponde il server.
   - La causa: `optimisticReading`, in `readingModel.ts`, mette `progress_percent` a `null`.
   - Quando `pageCount` non si conosce e la pagina nuova non è `null`, la copia ottimista tiene la percentuale in cache, come fa il server.
2. **L'anello dai riepiloghi.** Dove il telefono mostra l'anello da un `ReadingSummary` (`ReadingBadge`), usa `progress_percent` quando c'è.

## Test
- La copia ottimista tiene la percentuale nel caso del punto 1.
- `ReadingBadge` con `progress_percent: 37` mostra 37%.

## Acceptance criteria
- `npx vitest run src/modules/reading src/styles.test.ts` (da `apps/mobile`) passa.
- `npm run typecheck -w @bookeeper/mobile` passa.
- `impeccable detect --json` pulito sui file cambiati.
