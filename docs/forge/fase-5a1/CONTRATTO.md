# Contratto del run 5A1

Valgono per intero `docs/forge/fase-5a/CONTRATTO.md` e i contratti che cita. Nessuna dipendenza nuova. Ogni correzione ha un test che fallisce prima e passa dopo, dove il difetto si può provare. I nomi dei file di test hanno le stesse maiuscole del file che provano. Nessuna riformattazione di righe non toccate dalla correzione.

Aggiunta alla sezione API del contratto 5A: quando `PUT …/placement` senza `slot_index` trova il libro già su quel ripiano, la posizione non cambia ma un `spine_width` presente nella richiesta viene applicato (valore o `null`).
