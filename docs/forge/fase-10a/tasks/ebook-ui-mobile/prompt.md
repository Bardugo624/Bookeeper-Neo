Leggi prima `docs/forge/fase-10a/CONTRATTO.md`, che fissa valori, interfacce e regole, e la parte «Fase 10A» del design `docs/superpowers/specs/2026-11-27-ebook-design.md`. Le task del core sono già unite: usa `packages/api`.

# Telefono: scaricare, aggiungere e l'anello

## File
- `apps/mobile/src/modules/search/`: la scheda del libro, `BookDetailPage`.
- `apps/mobile/src/modules/reading/`: l'anello.
- `packages/i18n/src/locales/{it,en}/msearch.json` e `mreading.json`.

## Cosa fare
1. **Blocco «File»** nella scheda del libro, per chi non è `guest`. Ogni file mostra formato, dimensione e «Scarica»: `fetch` con l'autenticazione, poi un blob e il salvataggio del browser.
2. **«Aggiungi il file»** (`<input type="file">` con i sei formati), per chi può modificare. I messaggi d'errore sono quelli del computer.
3. **L'anello** usa `progress_percent` quando c'è.
   Un aggiornamento ottimista della lettura conserva `progress_percent` e `progress_at` della lettura in cache, così l'anello non si azzera.
4. **Bersagli:** tutti di almeno 44 px.

## Test
- Elenco, scarica, aggiungi, gli errori, niente blocco per `guest`.
- L'anello con `progress_percent`.

## Acceptance criteria
- `npm run typecheck -w @bookeeper/mobile` passa.
- `npx vitest run src/modules/search src/modules/reading src/styles.test.ts` (da `apps/mobile`) passa.
- `impeccable detect --json` pulito sui file cambiati.
