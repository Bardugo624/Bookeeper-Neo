Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Ogni correzione ha un test che fallisce prima e passa dopo.

# i18n: due difetti P3

1. **`glob.d.ts` in conflitto con `vite/client`** (`packages/i18n/src/glob.d.ts`): dichiara `glob` come metodo, Vite come proprietà; senza `skipLibCheck` TypeScript segnala `TS2300`. Regola: la dichiarazione DEVE convivere con i tipi di Vite. Dichiarala in modo compatibile (stessa forma di Vite, fusione di interfacce) oppure toglila e tipizza la chiamata in `index.ts` senza dichiarazioni globali. Prova: un file di test di tipo che include `vite/client` e importa `@bookeeper/i18n` compila con `skipLibCheck: false`.
2. **`__setForTest` esportata dal punto d'ingresso** (`packages/i18n/src/index.ts`): chiunque può cambiare le traduzioni dell'app. Regola: il punto d'ingresso esporta solo `Locale`, `DEFAULT_LOCALE`, `LOCALES`, `resolveLocale`, `t`. L'aiuto per i test si sposta in `src/testing.ts`, esportato in `package.json` come `./testing`. Un test controlla l'elenco esatto delle esportazioni di `index.ts`. Se altri pacchetti importano `__setForTest` dal punto d'ingresso, elencali nel rapporto.

## Acceptance criteria

- `npm test -w @bookeeper/i18n` e `npm run typecheck -w @bookeeper/i18n` passano.
- `npm run typecheck` e `npm test` dalla radice passano.
- Cambiano solo: `packages/i18n/src/index.ts`, `packages/i18n/src/glob.d.ts`, `packages/i18n/src/i18n.test.ts`, `packages/i18n/src/testing.ts`, `packages/i18n/package.json`.
