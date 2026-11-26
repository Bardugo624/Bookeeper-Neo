# PWA: nome di un file di test

La verifica del run fallisce su `packages/ui/src/caseCollisions.test.ts`: in `apps/mobile/src/modules/scan/` collidono `ShelfSession.tsx` e `shelfSession.test.tsx`.

Rinomina con `git mv` il file di test in `ShelfSession.test.tsx`. Nessuna modifica di contenuto. Poi esegui il test e correggi allo stesso modo ogni altro gruppo che segnala sotto `apps/`.

## Acceptance criteria

- `npm test -w @bookeeper/ui` passa.
- `npm test -w @bookeeper/mobile` e `npm run typecheck -w @bookeeper/mobile` passano.
- Cambiano solo file sotto `apps/mobile/src/modules/scan/`.
