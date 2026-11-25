Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2b/CONTRATTO.md`.

# UI: nomi di file che collidono su Windows

## Il difetto

In `packages/ui/src/shelf/` esistono `Spine.tsx` (componente) e `spine.ts` (funzioni `spineWidth`, `spineHeight`). Su Windows e macOS i due nomi senza estensione coincidono: `tsc` fallisce con `TS1149` e `Module "./Spine" has no exported member 'Spine'`. Su Linux passa, per questo nessuno l'ha visto.

## Cosa fare

1. Rinomina `spine.ts` in `spineMetrics.ts` e `spine.test.ts` in `spineMetrics.test.ts` (con `git mv`), e aggiorna ogni importazione. L'interfaccia pubblica di `@bookeeper/ui/shelf` non cambia.
2. Aggiungi `packages/ui/src/caseCollisions.test.ts`: elenca i file tracciati del repository sotto `packages/` e `apps/` (con `git ls-files`, eseguito dalla radice del repository) e fallisce se due percorsi, tolta l'estensione e portati in minuscolo, coincidono nella stessa cartella. Sono esclusi i casi voluti in cui i due file hanno lo stesso nome con le stesse maiuscole e differiscono solo per estensione o suffisso (`Foo.tsx` con `Foo.module.css`, `Foo.test.tsx`, `foo.ts` con `foo.test.ts`): la collisione è solo tra nomi che differiscono per maiuscole. Il messaggio d'errore elenca le coppie.
3. Se il test nuovo trova altre collisioni sotto `packages/ui/`, correggile allo stesso modo. Se ne trova altrove, elencale nel rapporto e fermati.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/ui -w @bookeeper/desktop` e `npm test -w @bookeeper/ui` passano.
- `git ls-files packages/ui/src/shelf | tr 'A-Z' 'a-z' | sed 's/\.[^.]*$//' | sort | uniq -d` non elenca coppie che differiscono per maiuscole.
- Cambiano solo: file sotto `packages/ui/src/shelf/` e `packages/ui/src/caseCollisions.test.ts`.
