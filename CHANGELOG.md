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

## [0.1.0] - 2026-01-15

Prima release pubblica del client desktop Bookeeper.

### Added

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
