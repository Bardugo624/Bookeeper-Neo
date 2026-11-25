Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui.

# Primo avvio: i quattro percorsi

## Obiettivo

Il modulo `welcome`: la schermata "01 — Primo avvio" del mockup e i quattro percorsi del design §6.4. Le task `app-foundation`, `ui-overlays` e `desktop-remote` sono già unite. Leggi `apps/desktop/src/app/`, `src/session/`, `src/platform/` e i test finti che offrono.

## Percorsi

| Percorso | Chiede | Chiamate |
| --- | --- | --- |
| **Crea qui** | nome libreria, tuo nome | connessione `local`; `POST /setup` senza codice, email e password |
| **Unisciti** | server (dall'elenco trovato in rete o digitato) + codice di abbinamento, oppure email e password | `probe`; `POST /pairing/redeem` oppure `POST /auth/libraries` e `POST /auth/login` |
| **Crea su un server** | indirizzo, codice di setup, nome libreria, nome, email, password | `probe`; `POST /setup` |
| **Bentornato** | nulla, o password se la sessione è scaduta | `POST /auth/login` sulla connessione salvata |

`device_kind` è `desktop`; `device_name` viene da `platform.deviceName()`.

## Regole

1. **Schermata**: come nel mockup. Una scheda aperta alla volta; "Crea qui" aperta all'inizio. Se `GET /setup` sul core locale dice `needs_setup: false` (esiste già una libreria locale), "Crea qui" diventa "Apri la libreria di questo computer" e non chiede nulla.
2. **Scoperta**: all'apertura si chiama `platform.discover()`. Se trova qualcosa, la scheda "Unisciti" mostra l'etichetta "N trovate in rete" e, aperta, l'elenco (nome, indirizzo). Scegliere una voce riempie l'indirizzo.
3. **Indirizzo remoto**: dopo `probe`.
   - `error: insecure_address`: messaggio che spiega che serve un indirizzo sicuro (`https://`), senza parole tecniche in più.
   - `error: network` o `not_bookeeper`: messaggio dedicato, i campi restano compilati.
   - `trusted: false` con `fingerprint`: `Dialog` "Controlla la frase" che mostra le sei parole, spiega che devono coincidere con quelle mostrate dal server, e ha i bottoni "Coincidono" e "Annulla". Solo dopo "Coincidono" la connessione si salva con quel `fingerprint` e si procede. Nessuna credenziale parte prima.
   - "Crea su un server" con `setup.needs_setup == false` sul server: si resta sul percorso, con il messaggio che il server ha già una libreria e il rimando a "Unisciti". Con `needs_setup == true` in "Unisciti": rimando a "Crea su un server".
4. **Email e password con più librerie**: se `POST /auth/libraries` restituisce più di una libreria, l'utente sceglie; con una sola si entra direttamente.
5. **Errori dell'API**: `invalid_credentials`, `invalid_code` (codice sbagliato o scaduto), `rate_limited` (con i secondi di `retryAfter`), `validation`, rete. Ogni errore ha un testo proprio accanto al campo o sopra il bottone, con `role="alert"`. Leggi i codici veri in `crates/bookeeper-core/src/api/`: non inventarli.
6. **Convalida prima dell'invio**: campi obbligatori, email con `@`, password di almeno la lunghezza che il core richiede (leggila nel core). Il bottone resta attivo: al clic compaiono gli errori e il fuoco va al primo campo sbagliato.
7. **Bentornato**: con una connessione salvata ma senza sessione valida, la schermata mostra in alto la scheda "Bentornato in <libreria>" con il campo password (assente per la connessione locale senza password: lì basta "Apri") e "Usa un'altra libreria" che mostra le tre schede. "Dimentica questa libreria" chiede conferma in un `Dialog`.
8. **Successo**: `signIn(connection, auth)` della sessione; il router porta alla prima voce del guscio.
9. Durante una richiesta il bottone è in `loading` e i campi sono disabilitati. Un doppio clic non manda due richieste.

Struttura: `routes.tsx` (modulo con `public`), una vista, un componente per scheda, un hook per percorso. Testi nello spazio dei nomi `welcome`, in italiano e in inglese.

## Test

Con il `Platform` finto e un client finto (o un trasporto finto): nessuna rete.

- Crea qui: due campi vuoti → errori e fuoco sul primo; compilati → `POST /setup` con il corpo giusto (senza `setup_code`, `email`, `password`), connessione `local` salvata e attiva, stato `ready`.
- Libreria locale già esistente: la scheda dice "Apri" e non mostra campi.
- Scoperta: una voce trovata → etichetta "1 trovata in rete"; scelta → indirizzo compilato.
- Unisciti con codice: `probe` fidato → `POST /pairing/redeem`; `invalid_code` → messaggio accanto al campo.
- Unisciti con email: una libreria → login diretto; due librerie → scelta, poi login con `library_id`.
- Certificato non fidato: compare la frase; "Annulla" non salva nulla e non manda credenziali; "Coincidono" salva `fingerprint` e prosegue.
- `insecure_address`, `network`, `not_bookeeper`: tre messaggi distinti.
- Crea su un server: corpo completo di `POST /setup` con `setup_code`; server già configurato → messaggio e rimando.
- `rate_limited` con `retryAfter: 30`: il testo contiene 30.
- Bentornato: password sbagliata → errore; giusta → `ready`; "Dimentica" con conferma rimuove la connessione.
- Doppio clic: una sola richiesta.
- Una sola scheda aperta alla volta; navigazione da tastiera tra le schede.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa (chiavi presenti in entrambe le lingue).
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti.
- Cambiano solo: file sotto `apps/desktop/src/modules/welcome/`, `packages/i18n/src/locales/it/welcome.json`, `packages/i18n/src/locales/en/welcome.json`.
