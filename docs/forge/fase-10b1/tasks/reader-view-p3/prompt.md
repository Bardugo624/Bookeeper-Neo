Leggi prima `docs/forge/fase-10b1/CONTRATTO.md`.

# Lettore e telefono: fogli, misure, tacche e domanda

## File
- `packages/reader/src/ui/view/`.
- `packages/reader/src/model/ticks.ts` e i suoi test in `src/model/tools.test.ts`.
- `apps/mobile/src/kit/BottomSheet.tsx`, e `BottomSheet.module.css` che diventa `BottomSheet.css`.
- `packages/ui/src/cssModuleImports.test.ts`, nuovo.

## Cosa fare
- **Fogli dal basso:** `Sheet.module.css` diventa `Sheet.css`, e `BottomSheet.module.css` diventa `BottomSheet.css`, importati per effetto. Oggi Vite li toglie dalla build e i fogli compaiono centrati.
- **Il test** `cssModuleImports.test.ts` fallisce con un `import './X.module.css';` senza nome in `packages` o `apps`.
- **Misure sul telefono:**
  - il pulsante della schermata d'errore è alto 48 px;
  - la ✕ dei fogli è 44×48.
- **Area sicura:** la disposizione del telefono legge `var(--rd-safe-top, env(safe-area-inset-top))`, così con il banner offline la tacca non conta due volte.
- **Tacche:** `chapterTicks` ne tiene al massimo 40, con la regola del contratto.
- **La domanda:** l'azione principale è un `Button` pieno.

## Test
- `no_side_effect_import_of_a_css_module`.
- `at_most_forty_ticks_and_the_first_stays`.
- `the_question_primary_action_is_filled`.
- `phone_targets_are_at_least_44_by_48`, sul pulsante d'errore e sulla ✕.

## Acceptance criteria
- `npm test -w @bookeeper/reader`, `npx vitest run src/cssModuleImports.test.ts src/caseCollisions.test.ts` (da `packages/ui`) e `npx vitest run src/kit` (da `apps/mobile`) passano.
- **Nella build di produzione** del telefono (`npm run build -w apps/mobile`), i CSS di `dist/assets` contengono `70dvh` e `85dvh`.
