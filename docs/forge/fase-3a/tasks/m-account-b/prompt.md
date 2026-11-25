Leggi prima `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Le task `m-foundation` e `m-foundation-2` sono già unite. Leggi `apps/mobile/src/{app,session,shell,kit}` e `clients/mobile-web/src/views/AccountView.vue`.

# Mobile: account

## Cosa fare

Modulo `account` con scheda "Account" (ordine 30), rotta `/account`.

1. **Chi sei**: libreria, nome e ruolo (da `me`), nome di questo dispositivo con "Rinomina" (`PATCH /devices/{id}`; limiti dal core).
2. **Aspetto**: tema Sistema/Chiaro/Scuro; lingua Sistema/Italiano/English (stessa chiave di preferenza e stesso comportamento del desktop: leggi `apps/desktop/src/app/i18n.tsx` e riproduci, senza importare).
3. **Installa l'app**: se il browser offre l'installazione (`beforeinstallprompt`), bottone "Aggiungi alla schermata Home"; su iOS, dove l'evento non esiste, tre righe che spiegano come farlo da Condividi; se l'app è già installata (`display-mode: standalone`) la sezione non compare. Dietro un'interfaccia in `modules/account`, con finto per i test.
4. **Informazioni**: versione dell'app e del server (`GET /health`), "Cerca aggiornamenti" che interroga il service worker tramite la piattaforma.
5. **Scollega questo telefono**: conferma in un `BottomSheet`; chiama il logout del core, cancella la sessione, porta a `/pair`. Se la richiesta fallisce per rete, la sessione locale si cancella comunque e si dice che il dispositivo va revocato dal computer.

Testi nello spazio dei nomi `maccount`.

## Test

- Dati mostrati; rinomina con convalida e richiesta.
- Tema e lingua: applicati e salvati; cambio lingua senza ricaricare.
- Installazione: con evento → bottone che chiama `prompt()`; iOS → istruzioni; già installata → sezione assente.
- Scollega: conferma; logout chiamato; sessione cancellata; errore di rete → cancellata comunque, con messaggio.
- "Cerca aggiornamenti" chiama la piattaforma.

## Punti da non sbagliare

La task `m-foundation-2` è unita: le preferenze di tema e lingua vivono nelle fondamenta. Usa `useThemePreference()` e `useLocalePreference()` da `apps/mobile/src/app`; togli dal modulo ogni gestione propria di tema e lingua.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile`, `npm test -w @bookeeper/i18n`, `npm run build -w @bookeeper/mobile` passano.
- Cambiano solo: file sotto `apps/mobile/src/modules/account/`, `packages/i18n/src/locales/{it,en}/maccount.json`.
