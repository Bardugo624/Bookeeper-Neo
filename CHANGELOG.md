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