Leggi prima `docs/forge/fase-4c1/CONTRATTO.md` e `docs/forge/fase-4b/CONTRATTO.md`. Leggi ogni file citato e i suoi test prima di cambiarlo.

# Desktop: difetti P3 del run 4C

1. `apps/desktop/src/modules/reading/useReading.ts` (`superseded()`): conta ogni scrittura in corso per il libro, anche le più vecchie. Se i salvataggi A e poi B tornano in ordine inverso, il successo di B è scartato e quello di A viene scritto: la pagina torna per un attimo al valore di A. Regola: ogni scrittura ha un numero d'ordine crescente per libro; una risposta si applica solo se nessuna scrittura con numero più alto è partita. Test con risposte in ordine diretto e inverso.
2. `apps/desktop/src/modules/reading/NoteField.tsx`: `before.current` non viene aggiornato dopo un salvataggio riuscito. Se un altro dispositivo riporta la nota al valore vecchio, il campo tiene il testo superato e lo riscrive all'uscita. Regola: dopo un salvataggio riuscito il riferimento è il valore salvato; un valore nuovo dal server, a campo non in modifica, sostituisce sempre il testo.
3. `apps/desktop/src/modules/reading/MarkReadButton.tsx`: `isError` è vero anche quando fallisce un aggiornamento in background dopo un caricamento riuscito, e il bottone o la riga "Letto il …" spariscono. Regola: si nasconde solo se non ci sono dati (primo caricamento fallito o in corso).
4. `apps/desktop/src/modules/settings/sections/audit/useAuditData.ts`: `gone` è vero per qualunque errore. Regola: "un libro non più presente" solo per un 404 (`ApiError` con stato 404); per gli altri errori vale la forma senza titolo.
5. `apps/desktop/src/modules/reading/testkit.tsx`: il file è stato riformattato per intero con virgolette doppie. Riportalo allo stile del repository (guarda `apps/desktop/src/modules/tags/testkit.tsx`), senza cambiare il comportamento.
6. `audit.json` (it e en): la chiave `unknownBook` non è più usata. Toglila, dopo aver verificato con una ricerca che nessun codice la legge.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Cambiano solo: file sotto `apps/desktop/src/modules/reading/`, `apps/desktop/src/modules/settings/sections/audit/`, i file i18n `audit.json` e `reading.json` (it e en).
