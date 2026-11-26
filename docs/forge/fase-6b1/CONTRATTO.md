# Contratto del run 6B1

Valgono per intero `docs/forge/fase-6b/CONTRATTO.md` e i contratti che cita. Nessuna dipendenza nuova. Ogni correzione ha un test che fallisce prima e passa dopo, dove il difetto si può provare. Nessuna riformattazione di righe non toccate dalla correzione.

Eccezione al contratto 6B: `ui-icons` aggiunge tre icone a `packages/ui`. Nessun'altra task tocca `packages/ui`.

## Icone (da `ui-icons`)

`Icon` di `@bookeeper/ui/base` guadagna `users` (Lucide `Users`), `user` (Lucide `User`) e `bell` (Lucide `Bell`).
