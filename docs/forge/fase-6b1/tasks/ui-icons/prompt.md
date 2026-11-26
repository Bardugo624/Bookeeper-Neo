Leggi prima `docs/forge/fase-6b1/CONTRATTO.md`. Leggi `packages/ui/src/base/Icon.tsx` e il suo test.

# Kit: tre icone

Aggiungi `users`, `user` e `bell` all'elenco di `Icon`, dalle icone Lucide del contratto, nello stesso modo delle altre. Il test dell'elenco le comprende.

## Acceptance criteria

- `npm test -w @bookeeper/ui` e `npm run typecheck -w @bookeeper/ui` passano.
- `npm run typecheck -w @bookeeper/desktop` e `npm run typecheck -w @bookeeper/mobile` passano.
- Cambiano solo `packages/ui/src/base/Icon.tsx` e `packages/ui/src/base/Icon.test.tsx`.
