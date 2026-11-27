# Contratto del run 8B1

Valgono per intero il contratto del run 8B (`docs/forge/fase-8b/CONTRATTO.md`) e quelli che cita, `PRODUCT.md` e `DESIGN.md`. La richiesta è in `docs/forge/fase-8b1/request.md`.

- Le task dell'interfaccia usano la skill Impeccable (`.claude/skills/impeccable/`) in modalità **Operate**, come nel run 8A: setup con `impeccable context --target <file>`, lettura di `reference/craft-floor.md` prima di ogni modifica, `impeccable detect --json` sui file cambiati alla fine. Il salvataggio dei rapporti sul servizio di Impeccable NON si usa.
- La direzione è decisa: NON proporre alternative e NON fare domande; dove la skill chiederebbe, decidi secondo questa consegna e scrivi nel rapporto cosa hai deciso.
- Ogni task tocca solo i file dichiarati. Il kit (`packages/ui`, `apps/desktop/src/kit`) NON si tocca.
- Regole di sempre: nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale; WCAG 2.2 AA; ogni comportamento ha un test (jsdom non ha layout: stato, ruoli, nomi, e test di stile sui fogli come quelli esistenti).
