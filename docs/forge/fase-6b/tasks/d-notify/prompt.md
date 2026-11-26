Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit` e il modulo che tocchi, con i test. Leggi `apps/desktop/src/platform` per intero con i test, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/src-tauri/Cargo.toml` e la sezione `appearance` delle impostazioni con i test.

# Desktop: notifiche di sistema

## Cosa fare

1. **Dipendenze**: esattamente le due del contratto. Rust nel crate `bookeeper-desktop` (`apps/desktop/src-tauri/Cargo.toml`), npm in `apps/desktop/package.json`. `Cargo.lock` e `package-lock.json` si aggiornano con `cargo` e `npm install -w @bookeeper/desktop`, non a mano. Plugin registrato in `lib.rs`; permesso `notification:default` in `capabilities/default.json`.
2. `NotificationControls` come da contratto, in `platform/types.ts`, con tre implementazioni: Tauri (il plugin), browser (l'API `Notification`, oppure `null` se manca), finta per i test.
3. Preferenza: file nuovo `apps/desktop/src/kit/overdueAlerts.ts` con `useOverdueAlerts(): [enabled, setEnabled]`, salvata nello spazio locale con try/catch, accesa per impostazione predefinita.
4. Sezione nuova delle impostazioni `apps/desktop/src/modules/settings/sections/notifications` ("Notifiche"): interruttore "Avvisami dei prestiti scaduti". Accendendolo con permesso `prompt` si chiede il permesso. Con `denied` compare la frase che dice dove riabilitarlo nelle impostazioni del sistema. La sezione non c'è dove `notifications` è `null`.
5. Nessun invio di notifiche in questa task: lo fa `d-overdue`.

## Test

- Piattaforma: Tauri con il plugin finto (come i test esistenti fingono gli altri plugin), browser con e senza `Notification`, finta.
- Sezione: interruttore, richiesta del permesso, frase con `denied`, sezione assente con `null`.
- Preferenza salvata e riletta; spazio locale non disponibile.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- `cargo fmt --check`, `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` e `cargo test -p bookeeper-desktop` passano.
- `cargo tree -p bookeeper-desktop -i openssl-sys` e `cargo tree -p bookeeper-desktop -i aws-lc-sys` non trovano nulla.
- Cambiano solo: file sotto `apps/desktop/src/platform/`, `apps/desktop/src/kit/overdueAlerts.ts` e il suo test, file sotto `apps/desktop/src/modules/settings/sections/notifications/`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/src/lib.rs`, `apps/desktop/src-tauri/capabilities/default.json`, `apps/desktop/package.json`, `package-lock.json`, `Cargo.lock`, i file i18n `notifications.json` (nuovo, it e en).
