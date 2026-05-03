# Changelog

Tutte le modifiche significative al client desktop Bookeeper sono
documentate qui. Il formato segue [Keep a Changelog](https://keepachangelog.com/it-IT/1.1.0/)
e il versioning aderisce a [Semantic Versioning](https://semver.org/lang/it/).

L'auto-updater dell'app legge la sezione corrispondente alla versione
pubblicata e la mostra nella dialog "Vedi novità". Sono supportati:

- heading `##`/`###`
- liste `-`/`*` e numerate
- enfasi `**bold**` / `*italic*`
- inline code `` ` ``
- link `[text](https://...)`

## [Unreleased]

### Added

- (in lavorazione)

## [0.1.16] - 2026-05-03

### Fixed

- **Pannello "Aggiornamenti" bianco in tema scuro**: il color-mix
  partiva da `--p-surface-0` (che resta bianco in PrimeVue anche in
  dark mode), producendo un riquadro chiaro fuori palette. Aggiunte
  override `:global(.dark)` con base `--p-surface-800`.
- **Tag genere overflow nella card libro**: i chip su una sola riga
  flex non andavano a capo e venivano tagliati oltre il bordo della
  card. Ora `flex-wrap: wrap` + ellipsis sui chip troppo lunghi.

## [0.1.14] - 2026-05-03

### Fixed

- **Copertine fantasma**: la cache locale (v9, introdotta in 0.1.12)
  conteneva blob spazzatura prodotti dal vecchio bug di decoding
  base64. Anche dopo il fix di 0.1.13, i record corrotti restavano in
  IndexedDB e impedivano la visualizzazione. Bump a v10 con wipe
  one-shot: alla prima apertura le copertine vengono ri-scaricate da
  zero.
- Quando l'`<img>` fallisce a decodificare un blob (URL stale, blob
  corrotto), il record viene cancellato automaticamente dall'IDB cosi'
  il prossimo accesso riparte pulito.

### Added

- **Indicatore di stato per ogni copertina**: piccolo badge in basso a
  destra mostra in tempo reale se la copertina sta venendo scaricata
  (spinner sage), se il download e' fallito (triangolo rosso), o se
  non e' disponibile sui provider (icona grigia).
- **Pulsante "ricarica" per ogni copertina**: in alto a destra,
  visibile su hover (sempre visibile in caso di errore o copertina
  non trovata). Forza un nuovo lookup metadata + download bypassando
  cache locale e blacklist negativa.

## [0.1.13] - 2026-05-03

### Fixed

- **Le copertine ora si vedono davvero**: il decoder dei bytes
  ricevuti dal backend interpretava male il formato di trasporto
  (base64 invece di array) e produceva immagini vuote. Risolto.

## [0.1.12] - 2026-05-03

### Fixed

- **Le copertine ora sono persistenti**: i bytes vengono salvati
  direttamente nella cache locale invece del solo URL, quindi
  sopravvivono ad aggiornamenti, riavvii dell'app e svuotamenti del
  cache HTTP del browser interno. Non vengono più riscaricate ad
  ogni avvio.
- **Aggiornamento dell'app non azzera più la cache copertine**:
  il database locale ora si aggiorna senza cancellare i record
  esistenti.

## [0.1.11] - 2026-05-03

### Fixed

- **Aggiornamento visibile e affidabile**: l'installer ora mostra
  brevemente una finestra di progresso (~2 secondi) invece di girare
  silenziosamente. Risolve definitivamente i casi in cui l'app si
  chiudeva senza essere effettivamente aggiornata: gli errori non sono
  più nascosti dalla modalità silent.

## [0.1.10] - 2026-05-03

### Fixed

- **Auto-updater affidabile su Windows**: l'aggiornamento ora chiude
  correttamente la versione precedente, sostituisce sempre i file e
  rilancia in automatico la nuova versione, anche in modalità silent.
  In precedenza l'app si chiudeva ma non veniva sostituita né
  riavviata.

## [0.1.0] - 2026-01-15

Prima release pubblica del client desktop Bookeeper.


- **Autenticazione end-to-end**: pairing device con invite code,
  certificati mTLS per dispositivo, refresh token automatico.
- **Sessione persistente**: opzione "ricordami su questo dispositivo"
  con riavvio dell'app senza nuovo login.
- **UI sessione scaduta**: banner chiaro su LoginView quando il refresh
  token decade, con redirect automatico.
- **Copertine libri**: ricerca automatica via Google Books + fallback
  su Open Library, con cache locale dedicata per dispositivo.
- **Auto-updater**: controllo aggiornamenti automatico all'avvio,
  download verificato via SHA-256, installazione silent in un click.
- **Tab Info nelle Impostazioni**: versione corrente, build date,
  bottone "Controlla aggiornamenti".


## [0.1.1] - 2026-01-15

- **Migliorie UI Updater**

## [0.1.2] - 2026-01-15

- **Update appicon**

## [0.1.4] - 2026-01-15

- **self elevation**

## [0.1.5] - 2026-01-15

- **Nuovo lookup**
-**Nuove categorie da google books**

## [0.1.6] - 2026-01-15

- **fix e docs flusso login e creazione nuovi tenant**

## [0.1.7] - 2026-01-15

- **MIGLIORMAENTI LOOKUP ISBN**

## [0.1.8] - 2026-01-15

- **hotfix copertine**
-**hotfix updater**