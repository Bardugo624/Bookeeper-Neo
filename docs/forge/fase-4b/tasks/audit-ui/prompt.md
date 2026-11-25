Leggi prima `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit`, il modulo che tocchi e i suoi test. Leggi `docs/forge/fase-2c/CONTRATTO.md` (sezioni delle impostazioni) e una sezione esistente.

# Registro attività

Sezione `audit` delle impostazioni: ordine 70, icona pertinente, visibile solo a proprietario e admin.

## Cosa fare

1. **Elenco** dal più recente, a pagine da 50 con "Carica altri": quando (data e ora locali, con il tempo relativo come titolo), chi (persona, o "Sistema" se assente), da quale dispositivo, cosa. Il "cosa" è una frase leggibile per ogni azione nota ("Ha aggiunto il libro «Titolo»", "Ha revocato un dispositivo"…): leggi nel core tutti i valori di `action` che vengono scritti (`grep` di `audit::` o equivalente) e scrivi una frase per ciascuno; un'azione sconosciuta mostra il nome grezzo. Il dettaglio JSON è consultabile in un riquadro richiudibile, formattato, mai come HTML.
2. **Filtri**: persona, dispositivo, azione (valori da `GET /audit/actions`, con le etichette leggibili), intervallo di date. Nell'indirizzo. "Azzera filtri".
3. **Collegamenti**: quando la voce riguarda un libro che esiste ancora, il titolo porta alla scheda.
4. **Esporta**: "Scarica CSV" dei risultati correnti (tutte le pagine fino a 5.000 voci, con avviso oltre), tramite `platform.saveFile`.
5. Stati: scheletri, vuoto, errore, 403 (non dovrebbe capitare: sezione nascosta).

Testi nello spazio dei nomi `audit`.

## Test

- Visibilità per ruolo.
- Frasi per almeno dieci azioni vere del core e ripiego per un'azione sconosciuta.
- Filtri mandati alla rotta e presenti nell'indirizzo; azzeramento.
- Paginazione.
- Dettaglio reso come testo (un valore con `<script>` resta testo).
- CSV: intestazioni, virgolette e a capo trattati, `saveFile` chiamato.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/settings/sections/audit/`, i file i18n `audit.json`.
