# Bookeeper 2.0

Bookeeper è il gestionale per la libreria di casa. Sai quali libri hai, dove stanno, a chi li hai prestati e a che punto sei con la lettura.

## Le tre parti

- **App desktop** (Windows, macOS, Linux). Ci tieni la libreria sul tuo computer. Non serve altro.
- **Server** (`bookeeper-server`). Tiene la libreria in rete, per più persone e più dispositivi. Gira su un NAS, un Raspberry, un VPS o un PC acceso.
- **PWA sul telefono**. Cerca i libri, scansiona i codici a barre, vedi dove sta ogni libro. Si apre dal server e funziona solo se il server ha un indirizzo HTTPS valido.

## Installare

Scarica tutto dalla [pagina delle release](https://github.com/Bardugo624/Bookeeper-Neo/releases).

- **App desktop**: scarica l'installatore del tuo sistema (`Bookeeper_*`), avvialo e scegli «Crea qui».
- **Server con Docker**: `docker compose up -d`, poi apri `http://<indirizzo>:7842`. Il codice di setup si legge con `docker compose logs bookeeper`.
- **Server come binario**: scarica `bookeeper-server-<versione>-<sistema>.tar.gz` (`.zip` su Windows), scompattalo, entra nella cartella e avvia `./bookeeper-server`.

Tutti i dettagli (HTTPS, proxy, servizio di sistema, backup, aggiornamenti) sono in [docs/deploy.md](docs/deploy.md).

## Documenti

- [docs/deploy.md](docs/deploy.md): mettere il server in rete.
- [CHANGELOG.md](CHANGELOG.md): le novità di ogni versione.
- [ROADMAP.md](ROADMAP.md): cosa c'è nella 2.0 e cosa arriva dopo.

## Sviluppo

Prerequisiti: Rust stable e Node 22. Su Linux servono anche le librerie di sistema di Tauri: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`.

```bash
cargo test --workspace                      # test Rust
npm ci && npm test                          # test JS
cargo run -p bookeeper-server               # avvia il server
npm run tauri dev -w @bookeeper/desktop     # avvia il desktop
```

Il server incorpora la PWA: prima di compilarlo costruiscila con `npm run build -w @bookeeper/mobile`.

## Licenza

MIT. Vedi [LICENSE](LICENSE).
