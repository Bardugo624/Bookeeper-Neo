# Richiesta

Richiesta del proprietario, alla lettera:

> Esegui la PR e poi lancia la fase 3

La pull request #1 ha la CI rossa su due job. Run **PR-1**: correggere ciò che la CI ha trovato. Implementatore `sonnet`, revisore `opus`, una riprova automatica, niente Fractal.

## Requisiti

1. Job `desktop-build` (Windows): `tsc` fallisce con `TS1149`, perché `packages/ui/src/shelf/Spine.tsx` e `packages/ui/src/shelf/spine.ts` differiscono solo per maiuscole e l'importazione `./Spine` è ambigua su un filesystem che non distingue le maiuscole.
2. Job `rust`: `cargo test --workspace` fallisce al collegamento di un binario di test con `ld terminated with signal 7 [Bus error]`: il runner esaurisce il disco collegando decine di binari di test con le informazioni di debug complete.
3. Avvisi della stessa esecuzione: dipendenze inutilizzate `printpdf` in `bookeeper-core`, `hex` e `tracing` in `bookeeper-net`.
