Leggi prima `docs/forge/fase-2c/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Leggi `apps/desktop/src/kit` e un modulo esistente (`loans`) per struttura, hook e test. Le task `settings` e `desktop-files` sono già unite.

# Import ed export

Sezione `transfer` delle impostazioni (contratto: ordine 40). Leggi `packages/api/src/resources/transfer.ts`, `crates/bookeeper-core/src/api/transfer.rs` e `crates/bookeeper-core/src/import.rs` (formati, rilevamento, limiti, rapporto, ruolo richiesto: la sezione è visibile solo a chi può usarla).

## Cosa fare

1. **Import**: scelta del file (trascinamento sul riquadro o clic). Formato: "Rileva automaticamente" oppure Goodreads, Calibre, LibraryThing (valori veri di `ImportFormat`). File oltre il limite del core rifiutato prima dell'invio. Durante l'invio barra indeterminata e bottone in `loading`. Al termine il **rapporto**: importati, saltati perché già presenti, righe con errore; elenco delle righe con errore (numero di riga, motivo) in una tabella scorrevole con al più 100 righe visibili e "Scarica l'elenco" (`saveFile`, CSV). Link "Vai ai libri". Query di libri e statistiche invalidate.
2. **Export**: JSON o CSV (formati veri del core), bottone "Esporta"; il contenuto arriva dal client (leggi come lo restituisce) e si salva con `saveFile`, nome `bookeeper-<libreria>-<aaaa-mm-gg>.<est>`. Annullare la finestra non è un errore. Toast al salvataggio riuscito.
3. Errori: `payload_too_large`, formato non riconosciuto (codice vero), `rate_limited`, rete.

Testi nello spazio dei nomi `transfer`.

## Test

- Import: file troppo grande rifiutato senza richiesta; formato scelto mandato; rapporto con i tre conteggi e plurali; elenco errori e scaricamento come CSV; invalidazioni; formato non riconosciuto → messaggio.
- Export: JSON e CSV → `saveFile` con nome, tipo e byte attesi; annullamento senza toast d'errore.
- Visibilità per ruolo.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/settings/sections/transfer/`, `packages/i18n/src/locales/it/transfer.json`, `packages/i18n/src/locales/en/transfer.json`.
