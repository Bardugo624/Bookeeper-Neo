Leggi prima `docs/forge/fase-2c/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Leggi `apps/desktop/src/kit` e un modulo esistente (`loans`) per struttura, hook e test.

# Impostazioni: aspetto, lingua, account, libreria, informazioni

## Cosa fare

1. **Modulo `settings`** secondo il contratto: `routes.tsx`, pagina con colonna delle sezioni (voci con icona, attiva con `aria-current`), raccolta delle sezioni con `import.meta.glob`, tipo `SettingsSection` esportato da `index.ts`. `/settings` porta alla prima sezione visibile. Sezione inesistente → prima sezione.
2. **`appearance`**: tema chiaro/scuro/sistema (`PillTabs` segmentato, usa `useTheme` esistente); lingua Sistema/Italiano/English secondo "Lingua" del contratto. Cambia `apps/desktop/src/app/i18n.tsx` per leggere la preferenza, reagire al cambio senza ricaricare e impostare `<html lang>`.
3. **`account`**: nome mostrato ed email in sola lettura se il core non offre una rotta per cambiarli (leggi `auth.rs`; non inventare rotte); **password**: imposta o cambia con `POST /auth/password` (leggi i campi veri: password attuale se esiste, nuova, lunghezza minima). Per una libreria locale senza password spiega a cosa serve (condivisione in rete, inviti). "Esci da questo dispositivo" (`signOut`).
4. **`library`**: nome della libreria, tipo di connessione (su questo computer, oppure indirizzo del server), ruolo della persona. "Usa un'altra libreria" esce e porta al primo avvio. Se il core ha una rotta per rinominare la libreria usala (solo proprietario); altrimenti il nome è in sola lettura.
5. **`about`**: versione dell'app e del server (`GET /health` e `getServerInfo`), modalità del server, se il telefono è utilizzabile (`phone_ready`) con la stessa spiegazione semplice usata in Dispositivi.

Testi nello spazio dei nomi `settings`.

## Test

- Sezioni: ordine, attiva nell'indirizzo, `visible` che nasconde una sezione finta, `/settings` → prima sezione.
- Tema: scelta applicata e salvata.
- Lingua: passando a English i testi cambiano senza ricaricare, `<html lang="en">`; "Sistema" segue `navigator.language`; la scelta sopravvive a un nuovo montaggio.
- Password: convalida (lunghezza minima dal core, conferma uguale), corpo della richiesta, password attuale sbagliata → errore accanto al campo, successo → toast e campi svuotati.
- Libreria: locale e remota mostrano il testo giusto; "Usa un'altra libreria" chiama `signOut`.
- Informazioni: versioni mostrate; `phone_ready` vero e falso.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/settings/` (escluse `sections/transfer` e `sections/backup`), `apps/desktop/src/app/i18n.tsx`, `apps/desktop/src/app/i18n.test.tsx`, `packages/i18n/src/locales/it/settings.json`, `packages/i18n/src/locales/en/settings.json`.
