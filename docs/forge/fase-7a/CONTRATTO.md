# Contratto del run 7A

Valgono regole e convenzioni dei contratti precedenti (`docs/forge/fase-1a` … `fase-6b1`). Qui ci sono solo le aggiunte.

## Regole aggiunte

- Nessuna dipendenza nuova, né npm né Rust.
- `docs/forge/` e `docs/superpowers/` sono la storia del progetto: NON si modificano.
- `ops/` NON si modifica: un push che tocca `ops/vps/run.sh` o `ops/vps/deploy/` agisce sul server di produzione.
- La skill Impeccable NON si usa in questo run: arriva nel run 7B.
- Ogni comando scritto nella documentazione è stato eseguito e funziona come scritto; ogni percorso citato esiste.
- Rust: `cargo fmt --check` passa. JS: i nomi dei file di test hanno le stesse maiuscole del file che provano.

## Libreria di prova da 10.000 libri (da `perf-core`)

Un aiutante dei test del core crea una libreria con 10.000 libri: 60% con ISBN-13, 2 stanze, 8 mobili pieni per il 70% dei libri, 30 tag (in media 2 per libro), 3 persone con stati di lettura sul 30% dei libri, 400 prestiti di cui 300 chiusi e 20 scaduti, 300 voci di wishlist, generi e lingue variati, anni dal 1900 al 2026. Stessi dati a ogni esecuzione (seme fisso).

## Budget (build `--release`, 10.000 libri, mediana di 20 richieste dopo un riscaldamento)

| Rotta | Budget |
| --- | --- |
| `GET /books` (prima pagina, ordine predefinito e per titolo) | 30 ms |
| `GET /books?q=…` (ricerca testuale) | 30 ms |
| `GET /books` con filtri combinati (lettura, tag, stanza, anni) | 50 ms |
| `GET /books/facets` | 80 ms |
| `GET /stats`, `GET /stats/reading` | 100 ms |
| `GET /books/isbn-index` | 150 ms |
| `GET /shelves/{id}/books`, `GET /loans`, `GET /audit` | 30 ms |
