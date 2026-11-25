Leggi prima `docs/forge/fase-2d/CONTRATTO.md` e i contratti che cita: regole, nomi e aspetto valgono anche qui. La task `sharing-ui` è già unita.

# Aggiornamenti: controllo, note di versione, installazione

Segui la sezione "Aggiornamenti" del contratto. Riferimento di comportamento: l'updater della 0.3 (cerca `updater` in `clients/desktop`): banner non bloccante e note di versione.

## Cosa fare

1. **Rust, `updates.rs`**: `tauri-plugin-updater` e `tauri-plugin-process`, costruiti a tempo di esecuzione con `updater_builder()`: chiave pubblica da `option_env!("BOOKEEPER_UPDATER_PUBKEY")`, indirizzo da `option_env!("BOOKEEPER_UPDATE_BASE")` con predefinito `https://app.neokeeper.dev/updates`, percorso `/<canale>/latest.json`. Senza chiave: `Disabled`, e nessuna richiesta di rete. Comandi `update_check` e `update_install`, evento di avanzamento. Canale non valido → errore. Codici d'errore: `network`, `signature`, `manifest`, `install`. TLS del plugin: solo `rustls` con `ring` (controlla le funzioni e `cargo tree`). Permessi minimi in `capabilities/default.json`.
   La logica che non dipende dal plugin (indirizzo dal canale, mappa degli errori, confronto di versione con suffissi `-beta.N`: su `stable` un'app beta riceve la stabile uguale o successiva; su `beta` riceve beta e stabili successive) sta in funzioni pure.
2. **Piattaforma**: `updates: { check(channel); install(channel); onProgress(cb): () => void } | null`.
3. **Modulo `updates`** (senza voce di navigazione): `useUpdates` con controllo all'avvio e ogni 6 ore; `UpdateBanner` montato dal guscio? NO: il guscio non è un tuo file. Il banner è reso dalla sezione delle impostazioni e da un portale che il modulo monta da solo in `document.body` quando è caricato; il modulo si carica perché esporta un `routes.tsx` senza rotte e senza voce, raccolto come gli altri moduli (leggi `apps/desktop/src/app/modules.ts`; se un modulo senza rotte non viene montato, fermati e dillo).
   Banner: "È disponibile Bookeeper <versione>", "Vedi le novità" (dialog con le note: testo semplice, a capo conservati, link `http`/`https` cliccabili, nessun HTML interpretato), "Più tardi" (nasconde quella versione, ricordata in `localStorage`). Dal dialog: "Aggiorna e riavvia" con barra di avanzamento; durante l'installazione il dialog non si chiude; errore → messaggio per codice e "Riprova".
4. **Sezione `updates`** delle impostazioni (ordine 80, visibile solo se `platform.updates` esiste e lo stato non è `Disabled`): versione installata, canale stabile/beta (`PillTabs`; passare a beta mostra una riga di avviso), "Cerca aggiornamenti", ultimo controllo, stato.

Testi nello spazio dei nomi `updates`.

## Test

- Rust: indirizzo per canale e per base personalizzata; senza chiave → `Disabled` senza rete; confronto di versioni (tabella di casi); mappa degli errori; canale non valido.
- React: `Disabled` → nessun banner e nessuna sezione; `Available` → banner; "Più tardi" lo nasconde per quella versione e non per la successiva; note rese come testo (una nota con `<script>` resta testo); installazione con avanzamento e dialog non chiudibile; errore `signature` → messaggio dedicato; controllo ogni 6 ore con timer finti e mai durante un'installazione; cambio di canale → nuovo controllo.

## Acceptance criteria

- `cargo test -p bookeeper-desktop`, `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings`, `cargo build -p bookeeper-desktop` passano.
- `cargo tree -i aws-lc-rs`, `-i aws-lc-sys`, `-i openssl-sys` non trovano nulla.
- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop`, `npm test -w @bookeeper/i18n`, `npm run build -w @bookeeper/desktop` passano.
- Cambiano solo: `apps/desktop/src-tauri/src/lib.rs`, `updates.rs`, `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock`, `capabilities/default.json`, file sotto `apps/desktop/src-tauri/tests/`, `apps/desktop/src/platform/`, `apps/desktop/src/modules/settings/sections/updates/`, `apps/desktop/src/modules/updates/`, `apps/desktop/package.json` e `package-lock.json` solo per i pacchetti JavaScript dei due plugin, i file i18n `updates.json`.
