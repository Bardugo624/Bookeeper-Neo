# Contratto della fase 10A1

Vale tutto il contratto della 10A (`docs/forge/fase-10a/CONTRATTO.md`). Qui ci sono solo i cambiamenti e i valori di questo giro.

## Valori
- **Tempo di grazia dei file non attaccati:** 24 ore, come la pulizia della 10A.
- **Larghezza minima della colonna centrale della scheda del libro:** 360 px. Sotto, la colonna di destra va sotto quella centrale.
- **Spazio fra la riga dei dati e il blocco «File»:** 24 px.
- **Messaggio del download occupato:**
  - italiano: «C'è già un download in corso: aspetta che finisca.»
  - inglese: «Another download is in progress: wait for it to finish.»

## API
- `ReadingSummary` (in `BookOut.reading`) riceve `progress_percent: number | null`. È lo stesso valore di `ReadingOut.progress_percent`.
- `DELETE /api/v1/books/{id}/files/{file_id}` cancella il file dal disco solo se nessuna riga di `book_files` lo usa **e** il file è più vecchio del tempo di grazia. Se è più giovane, lo toglie la pulizia oraria.
- Tornando a `to_read`, `progress_percent`, `progress_at` e `progress_device_id` diventano `NULL`.
- Dopo il cambio, rigenera `packages/api` con il comando del contratto della 10A.

## Regole
- Il rosso solo nella conferma: `DESIGN.md`, «Zona pericolosa».
- Ogni task che cambia Rust passa `cargo fmt --all -- --check`.
- Ogni test che si appoggia ai tempi aspetta un segnale, non una durata fissa.
