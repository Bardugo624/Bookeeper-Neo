Leggi prima `docs/forge/fase-8a/CONTRATTO.md` (in particolare «Il tour»), `docs/forge/fase-8a/request.md`, `PRODUCT.md` e `DESIGN.md`. Sono già unite `tour-core` (il motore in `apps/desktop/src/modules/tour/`) e `tour-start` (il percorso `firstBook` con il passo 1, la partenza per le persone nuove, «Primi passi» nella barra e le ancore `nav.*`).

# Desktop: il tour, il primo mobile e il telefono

## Cosa

Aggiungi al percorso `firstBook` i passi 2 e 3, e il finale. Setup di Impeccable da `apps/desktop` con `--target src/modules/tour`; leggi `reference/onboard.md`, `reference/overdrive.md` e `reference/craft-floor.md`.

## Passo 2: «Dagli un posto»

- Fuori dagli Scaffali il riflettore è su `nav.shelves`.
- Negli Scaffali senza mobili è su «Nuovo mobile» (ancora `shelves.new`): «Crea il mobile dove tieni i libri: un nome e quanti ripiani». Se un mobile c'è già (lo ha creato qualcun altro), questo momento si salta.
- Creato il mobile (segnale `shelf-created`, mandato quando il salvataggio di un mobile nuovo riesce), il riflettore scivola sul libro nell'elenco dei non collocati (ancora `shelves.unplaced`) e la scheda dice di trascinarlo su un ripiano, o di usare «Colloca».
- Si completa con il segnale `book-placed`, mandato quando un libro viene collocato con successo, a trascinamento o con «Colloca».{{SHELVES}}

## Passo 3: «Portalo in tasca»

- Esiste solo se si può abbinare un telefono (libreria su un server con HTTPS valido, come decide già il modulo dei dispositivi per mostrare «Aggiungi un telefono»). Altrimenti il percorso finisce al passo 2: l'avanzamento mostra 2 passi.
- Fuori dai Dispositivi il riflettore è su `nav.devices`; poi su «Aggiungi un telefono» (ancora `devices.addPhone`); con il QR aperto, sul QR (`devices.qr`): «Inquadralo con la fotocamera del telefono».
- Si completa con il segnale `device-paired`, quando l'app vede il nuovo telefono abbinato.{{DEVICES}}

## Finale

Completato l'ultimo passo, la scheda mostra per pochi secondi «La tua libreria è pronta», con tutti i segnalibri pieni; poi si chiude da sola (o con un clic). Lo stato diventa `done` e «Primi passi» sparisce. Con il movimento ridotto nessuna animazione, stesso esito.

## Testi

Nel namespace `tour` (italiano e inglese): titoli e testi dei passi 2 e 3 nei loro momenti, il finale.

## Test

- Passo 2: il riflettore va da `nav.shelves` a «Nuovo mobile», poi al libro da collocare; `shelf-created` sposta il riflettore; `book-placed` completa; con un mobile già esistente si parte dal libro da collocare.
- I segnali partono davvero dai salvataggi riusciti (mobile nuovo, collocazione a trascinamento e con «Colloca») e non dai falliti.
- Passo 3 solo se il telefono si può abbinare; altrimenti il percorso ha 2 passi; `device-paired` completa.
- Il finale porta a `done` e toglie «Primi passi».

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` passa; `npx vitest run src/modules/tour src/modules/shelves src/modules/devices` (da `apps/desktop`) passa; `npm test -w @bookeeper/i18n` passa.
- Nessun componente oltre 250 righe; nessun testo nei componenti; nessun colore letterale.
- `.claude/skills/impeccable/scripts/impeccable detect --json` sui file cambiati non trova nulla.
- Cambiano solo i file dichiarati della task.
