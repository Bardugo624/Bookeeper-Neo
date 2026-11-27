# Contratto del run 8B

Vale per intero `docs/forge/fase-8a/CONTRATTO.md`, con la regola della zona pericolosa **sostituita** da questa (già scritta in `DESIGN.md`, sezione «Zona pericolosa»):

- **La zona fissa (`DangerZone`) resta solo** nelle sezioni delle Impostazioni del desktop e nell'Account del telefono. Lì non si tocca.
- **Altrove l'azione torna al suo posto, come nella 2.0.0**: in un menu o in un bottone normale, senza rosso e senza zona. Come stava si vede con `git show f4187c9:<file>` (il commit del tag `v2.0.0`).
- **Il rosso sta nella conferma**: premendo l'azione si apre `ConfirmDialog` (o `Dialog`) con `tone="danger"`, che dice la conseguenza. Le conseguenze scritte nei run 8A e 8A1 restano: spostale nella conferma dove oggi stanno nella zona.
- Nei menu le voci pericolose restano in fondo dopo un divisore, in rosso (il menu si vede solo quando lo apri): è il comportamento del kit e non si tocca.
- I testi rimasti senza uso (`*.danger.*` dei moduli dove la zona sparisce) si tolgono, in italiano e in inglese.
- Ogni cambiamento ha un test: la zona non c'è più; l'azione c'è al suo posto; la conferma ha il tono e la conseguenza; i permessi sono quelli di prima.
- Alla fine: `npx vitest run src/kit/styles.test.ts src/kit/translationKeys.test.ts` (desktop) o `src/styles.test.ts` (telefono) passa; `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla. Ogni task tocca solo i file dichiarati.
