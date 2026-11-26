Leggi prima `docs/forge/fase-4c/CONTRATTO.md` e `docs/forge/fase-4b/CONTRATTO.md`. Leggi ogni file citato e i suoi test prima di cambiarlo.

# Desktop: difetti P3 del run 4B

Dieci difetti confermati dal revisore. Per ognuno: un test che fallisce prima e passa dopo.

## Registro attività (`apps/desktop/src/modules/settings/sections/audit`)

1. `audit.json`, chiave `total`: "1 voci". Usa la forma plurale `{one, other}` del pacchetto i18n, in italiano e in inglese.
2. `useDescribe.ts`: quando il libro non esiste più o è ancora in caricamento, la frase mostra «libro sconosciuto» tra virgolette. Regola: durante il caricamento la frase usa la forma senza titolo ("Ha modificato un libro"); a libro mancante usa una forma dedicata ("un libro non più presente"), senza virgolette.
3. `useAuditExport.ts`: la data nel nome del file CSV viene da `toISOString()`, che è UTC. Usa la data locale.

## Prestiti (`apps/desktop/src/modules/loans`)

4. `LoansPage.tsx`: l'indirizzo `/loans?borrower=Anna` senza `filter` mostra solo i prestiti in corso. Regola: con `borrower` e senza `filter`, la vista è "tutti".

## Lettura (`apps/desktop/src/modules/reading`)

5. `NoteField.tsx`: una nota di soli spazi viene rimandata a ogni uscita dal campo. Regola: confronto sul testo ripulito; soli spazi valgono nota vuota.
6. `NoteField.tsx`: se il salvataggio fallisce, il testo scritto si perde. Regola: resta nel campo.
7. `MarkReadButton.tsx`: se lo stato di lettura non si carica, il bottone si vede e un tocco azzera valutazione e nota. Regola: il bottone non si mostra finché lo stato non è caricato con successo.
8. `useReading.ts`: due `+` rapidi fanno tornare indietro il numero di pagina per un attimo. Regola: la risposta di un salvataggio superato non sovrascrive il valore ottimistico più recente.
9. `ReadingRing.tsx` e gli altri componenti della cartella: testi scritti nei componenti. Portali in `reading.json`, nelle due lingue.

## Tag (`apps/desktop/src/modules/tags`)

10. `TagColorPicker.tsx`: una freccia premuta durante un salvataggio in corso sposta il fuoco su un colore non selezionato. Regola: durante il salvataggio le frecce non spostano il fuoco.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Cambiano solo: file sotto `apps/desktop/src/modules/settings/sections/audit/`, `apps/desktop/src/modules/loans/`, `apps/desktop/src/modules/reading/`, `apps/desktop/src/modules/tags/`, i file i18n `audit.json`, `reading.json`, `loans.json`, `tags.json` (it e en).
