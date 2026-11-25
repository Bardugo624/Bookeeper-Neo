Leggi prima `docs/forge/fase-2c/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Leggi `apps/desktop/src/kit` e un modulo esistente (`loans`) per struttura, hook e test. Le task `settings` e `desktop-files` sono già unite.

# Backup e ripristino

Sezione `backup` delle impostazioni (contratto: ordine 50). Leggi `packages/api/src/resources/backup.ts`, `crates/bookeeper-core/src/api/backup.rs`, `backup_schedule.rs` e `confirm.rs` (formato dell'archivio, limiti, conferma con password, rapporto di ripristino, ruolo richiesto: sezione visibile solo a chi può usarla).

## Cosa fare

1. **Backup ora**: "Crea un backup" scarica l'archivio dal core e lo salva con `saveFile` (nome proposto dal core, se c'è un `content-disposition`; altrimenti `bookeeper-backup-<aaaa-mm-gg>.zip`).
2. **Backup programmato**: frequenza in giorni (0 = spento) e quanti tenerne, dai campi veri di `BackupConfig`; salvataggio con convalida dei limiti del core. Sotto, l'elenco dei backup automatici presenti (data, dimensione leggibile), con "Scarica" per ciascuno solo se il core lo offre.
3. **Ripristino**: scelta del file; riquadro di avviso che dice in parole semplici cosa succede ai dati attuali (leggi nel core se il ripristino sostituisce o unisce). Conferma in due passi: `ConfirmDialog` in cui si digita il nome della libreria per abilitare "Ripristina", poi la password tramite `usePasswordConfirm` se il core risponde `confirmation_required` (il gettone va nella ripetizione). Al termine il rapporto del core e tutte le query invalidate. Errori: `invalid_archive`, `payload_too_large`, archivio di una versione non supportata (codice vero).
4. Durante backup e ripristino i bottoni sono in `loading` e la sezione non permette una seconda operazione.

Testi nello spazio dei nomi `backup`.

## Test

- Backup ora → `saveFile` con nome e byte; annullamento silenzioso.
- Programmazione: valori iniziali dal core; limiti; 0 spegne; salvataggio.
- Elenco dei backup automatici con data e dimensione.
- Ripristino: "Ripristina" disabilitato finché il nome non coincide; `confirmation_required` → password → ripetizione con gettone; rapporto mostrato; `invalid_archive` → messaggio e nessuna invalidazione.
- Seconda operazione impedita durante la prima.
- Visibilità per ruolo.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/settings/sections/backup/`, `packages/i18n/src/locales/it/backup.json`, `packages/i18n/src/locales/en/backup.json`.
