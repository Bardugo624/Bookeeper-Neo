# Contratto del run 8A1

Vale per intero `docs/forge/fase-8a/CONTRATTO.md` (Impeccable, movimento, tour, zona pericolosa, regole). Il run 8A è integrato nel ramo. Questo giro corregge rilievi precisi: niente ridisegno, niente funzioni nuove, nessun cambiamento fuori da ciò che ogni task elenca.

- Ogni correzione ha un test dove si può provare.
- Alla fine: `npx vitest run src/kit/styles.test.ts` (desktop) o `src/styles.test.ts` (telefono) passa se cambia un foglio di stile; `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Ogni task tocca solo i file dichiarati.
