Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# i18n: cataloghi per spazio dei nomi

## Obiettivo

Oggi `packages/i18n` ha un file per lingua. Ogni modulo dell'app aggiungerà le proprie chiavi: con un file solo, le task in parallelo si scontrano. Dividi i cataloghi per spazio dei nomi.

## Cosa fare

1. Sposta le chiavi esistenti in `src/locales/it/{app,status,mobile}.json` e `src/locales/en/{app,status,mobile}.json`. Il primo segmento della chiave è il nome del file: `app.name` è `name` dentro `app.json`. Rimuovi `src/it.json` e `src/en.json`.
2. `src/index.ts` carica i cataloghi con `import.meta.glob('./locales/*/*.json', { eager: true })`. L'interfaccia pubblica non cambia: `Locale`, `DEFAULT_LOCALE`, `resolveLocale`, `t`. Aggiungi `LOCALES: readonly Locale[]`.
3. `t` supporta il plurale minimo: se la chiave punta a un oggetto con `one` e `other` e `vars.count` è un numero, sceglie con `Intl.PluralRules`.
4. `tsconfig.json`: tipi `vite/client`. Se serve una dipendenza di sviluppo per quei tipi (`vite`), NON aggiungerla: dichiara `ImportMeta.glob` in un file `src/glob.d.ts`.

## Test

In `src/i18n.test.ts`:

- Le chiavi esistenti rendono lo stesso testo di prima, in entrambe le lingue.
- `every key exists in every locale`: confronta l'insieme delle chiavi (percorsi completi, foglie) tra `it` e `en`, spazio per spazio; fallisce elencando le chiavi mancanti.
- `no namespace file is empty`.
- Chiave mancante in `en`: ricade su `it`, poi sulla chiave.
- Plurale: `{ one: '{count} libro', other: '{count} libri' }` con `count` 1 e 5.
- Variabile assente nel testo: il segnaposto resta.

## Acceptance criteria

- `npm test -w @bookeeper/i18n` e `npm run typecheck -w @bookeeper/i18n` passano.
- `npm run typecheck` e `npm test` dalla radice passano: `apps/desktop` e `apps/mobile` usano le chiavi di prima senza modifiche.
- `npm run build -w @bookeeper/mobile` passa (il glob funziona nella build).
- Cambiano solo file sotto `packages/i18n/`.
