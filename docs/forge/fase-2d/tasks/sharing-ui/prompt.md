Leggi prima `docs/forge/fase-2d/CONTRATTO.md` e i contratti che cita: regole, nomi e aspetto valgono anche qui. Le task `sharing-core` e `p3-app` sono già unite. Leggi anche `docs/forge/fase-2c/CONTRATTO.md` (sezioni delle impostazioni) e una sezione esistente (`backup`).

# Impostazioni: condivisione in rete

## Cosa fare

1. **Piattaforma**: `sharing: { status(): Promise<SharingStatus>; set(enabled, port?): Promise<SharingStatus> } | null` in `Platform` (`null` nel browser), in `tauriPlatform` e nella piattaforma finta. Tipo `SharingStatus` con i campi del contratto.
2. **Sezione `sharing`** (ordine 60, visibile solo se `platform.sharing` esiste, la connessione è `local` e la persona è proprietaria):
   - Interruttore "Condividi questa libreria in rete" con una riga che spiega: gli altri computer di casa con Bookeeper possono collegarsi; i telefoni no (D7), con rimando a Dispositivi.
   - **Senza password**: l'interruttore non attiva; compare un riquadro "Prima imposta una password" con link a `/settings/account`. Lo stesso se il guscio risponde `password_required`.
   - **Attiva**: gli indirizzi (ognuno con "Copia"), la porta, e la **frase di verifica** in grande, con la spiegazione: chi si collega vedrà le stesse sei parole e deve controllare che coincidano. Impronta completa in un dettaglio richiudibile.
   - **Porta**: campo modificabile solo a condivisione spenta (1024–65535).
   - Errori: `port_in_use` (propone di cambiare porta), `tls`, `mdns` (avviso non bloccante: la condivisione funziona ma gli altri computer devono scrivere l'indirizzo a mano).
   - Come collegare un altro computer: tre passi che rimandano a Dispositivi → "Aggiungi un computer".
3. Durante l'attivazione l'interruttore è occupato; lo stato si rilegge all'apertura della sezione.

Testi nello spazio dei nomi `sharing`.

## Test

- Visibilità: browser, connessione remota, non proprietario → sezione assente.
- Senza password → riquadro e nessuna chiamata a `set`.
- Attivazione → indirizzi, frase, impronta; "Copia" scrive negli appunti.
- `port_in_use` → messaggio e campo porta; `mdns` → avviso con condivisione attiva.
- Porta non modificabile a condivisione attiva; convalida dell'intervallo.
- Spegnimento → stato spento.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop`, `npm test -w @bookeeper/i18n`, `npm run build -w @bookeeper/desktop` passano.
- Cambiano solo: file sotto `apps/desktop/src/platform/` e `apps/desktop/src/modules/settings/sections/sharing/`, `packages/i18n/src/locales/it/sharing.json`, `packages/i18n/src/locales/en/sharing.json`.
