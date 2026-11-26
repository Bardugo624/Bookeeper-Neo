Leggi prima `docs/forge/fase-7b1/CONTRATTO.md`. Leggi `apps/mobile/src/modules/search/WherePage.module.css`.

# PWA: regola duplicata in "Dov'è?"

**[P3]** `WherePage.module.css`, circa riga 28: `.phrase` è dichiarata due volte. `text-wrap: pretty` va nella regola che esiste già (circa riga 19), e la seconda si toglie. Nessun cambiamento visibile.

## Acceptance criteria

- `npm run typecheck`, `npm test` e `npm run build` dell'app passano; `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambia solo `apps/mobile/src/modules/search/WherePage.module.css`.
