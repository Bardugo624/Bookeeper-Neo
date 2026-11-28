Leggi prima `docs/forge/fase-10b/CONTRATTO.md`, che fissa valori, interfacce e regole, e `docs/superpowers/specs/2026-11-28-lettore-design.md`.

# Telefono: leggere senza rete

## File
- `apps/mobile/src/modules/reader/`.
- `apps/mobile/src/modules/search/`: il blocco dei file nella scheda del libro.
- `packages/i18n/src/locales/{it,en}/mreader.json` e `msearch.json`.

## Cosa fare
- **`opfsLibrary`**, con i percorsi del contratto:
  - `has(sha)`, `save(meta, stream, onProgress, signal)`, `open(sha)`, `remove(sha)`, `list()` e `usage()`;
  - un salvataggio interrotto non lascia file a metà;
  - al primo salvataggio chiede `navigator.storage.persist()`.
- **`loadFile` del telefono** apre prima la copia offline, se c'è.
- **Nella scheda del libro e nel menu «⋯» del lettore**, come nello schizzo `08`:
  - «Scarica per leggere offline»;
  - «Scarico… 40%» con «Annulla»;
  - «Sul telefono · 2,4 MB» con «Togli dal telefono».
- **iPhone da Safari, non installato:** il pulsante apre la spiegazione con i tre passi (`BottomSheet`), invece di scaricare.
- **Offline senza copia:** il lettore mostra «Sei offline e questo libro non è sul telefono».
- **Al ritorno della rete** (`online`) la coda si svuota.

## Passi
- [ ] Test, con un OPFS finto in memoria, prima del codice:
  - `save_open_and_remove`;
  - `an_aborted_save_leaves_nothing`;
  - `progress_is_reported`;
  - `the_offline_copy_opens_first`;
  - `iphone_in_safari_gets_the_explanation_instead`;
  - `offline_without_a_copy_says_so`;
  - `the_queue_drains_when_the_network_comes_back`.
- [ ] Verifica che falliscano, scrivi il codice, verifica che passino.
- [ ] Guarda la scheda e il foglio in Chromium a 390×844 e confrontali con lo schizzo `08`.

## Acceptance criteria
- `npm test -w apps/mobile`, `npm test -w @bookeeper/i18n` e `npm run typecheck -w apps/mobile` passano.
- `impeccable detect --json` è pulito sui file toccati.
