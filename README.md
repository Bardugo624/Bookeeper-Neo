# Bookeeper Neo
Applicativo gestionale librerie domestiche, completo di funzioni avanzate e incentrato sulla robustezza e semplicità di utilizzo

## Sviluppo 2.0

Prerequisiti: Rust stable e Node 22. Su Linux servono anche le librerie di sistema di Tauri: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev`.

```bash
cargo test --workspace                      # test Rust
npm ci && npm test                          # test JS
cargo run -p bookeeper-server               # avvia il server
npm run tauri dev -w @bookeeper/desktop     # avvia il desktop
```
