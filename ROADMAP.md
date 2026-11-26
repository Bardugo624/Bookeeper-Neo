# Roadmap

Bookeeper 2.0 è una versione nuova, senza compatibilità con la 0.x. Questo file dice cosa c'è, cosa arriva e cosa è solo un'idea. Le novità di ogni versione sono nel [CHANGELOG](CHANGELOG.md).

## 2.0 — ora

### Base
- Core in Rust, condiviso da app desktop e server.
- App desktop (Tauri) con la libreria sul tuo computer: «Crea qui», senza password.
- Server autonomo: binario statico e immagine Docker. TLS `off`, `acme` o `self`.
- Dispositivi abbinati con un codice, revocabili. Limite ai tentativi di accesso.
- Backup programmato con rotazione, backup a mano, ripristino.
- Import da Goodreads, Calibre e LibraryThing. Export in JSON e CSV.
- Italiano e inglese, tema chiaro e scuro, aggiornamenti dell'app con note di versione.

### Lettura e organizzazione
- Stato di lettura per persona, con date, valutazione e nota.
- Tag colorati, stanze, filtri avanzati, ricerca testuale.
- Statistiche di lettura e «Il tuo anno in libri».

### Scaffale fisico
- «Dov'è?»: dalla ricerca, dalla palette o dalla scheda libro si apre lo scaffale.
- Trascina i libri tra gli scaffali, anche da tastiera.
- Dorso dal colore della copertina.
- Scan-a-scaffale dal telefono.

### Famiglia e mobile
- Più persone con quattro ruoli, inviti, registro attività.
- Prestiti anche a membri, storico dei prestiti, promemoria sul desktop.
- Wishlist di famiglia.
- PWA sul telefono: cerca, scansiona, scheda libro modificabile, prestiti, wishlist, anti-doppio-acquisto offline.
- Palette comandi (`Ctrl+K`).

Il telefono funziona solo con un server con HTTPS valido. Vedi [docs/deploy.md](docs/deploy.md).

## 2.1 — in arrivo

- **Notifiche push sulla PWA**: l'avviso dei prestiti scaduti arriva anche sul telefono.
- **Eliminazione della libreria**: il proprietario può cancellare una libreria da un server.

## Idee senza data

Non sono promesse. Le valutiamo dopo la 2.1.

- Fonte SBN/OPAC per le edizioni italiane.
- Consigli «cosa leggere dopo» calcolati sul dispositivo.
- Pagina del prestito da condividere.
- Wishlist da condividere con un link.
- Valore della collezione, con esportazione in PDF.
- API pubblica documentata, con token.

## Cosa non faremo

- Un limite al numero di libri.
- Un profilo pubblico o un feed sociale: i dati di lettura restano tuoi.
- Un'app nativa per telefono: la PWA basta.
