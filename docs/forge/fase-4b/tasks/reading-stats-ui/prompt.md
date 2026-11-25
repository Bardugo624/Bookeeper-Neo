Leggi prima `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit`, il modulo che tocchi e i suoi test.

# Statistiche di lettura e "Il tuo anno in libri"

## Cosa fare

1. **Schede** in cima a Statistiche: "Libreria" (ciò che c'è oggi) e "Lettura" (`PillTabs`, nell'indirizzo).
2. **Lettura** (`GET /stats/reading?year=`): selettore dell'anno tra quelli disponibili; `StatCard` per libri letti, pagine, valutazione media; barre "per mese" (dodici colonne SVG con i valori leggibili e una tabella equivalente per le tecnologie assistive); **calendario di lettura** dell'anno (griglia di giorni stile mappa di calore, una cella per giorno, quattro intensità dai token primari, titolo accessibile "N libri il <data>"); generi letti con `FillBar`; il libro più lungo con link alla scheda. Anno senza letture: stato vuoto che invita a segnare un libro come letto.
3. **"Il tuo anno in libri"**: bottone che apre un dialog con l'anteprima di un'immagine 1080×1350 disegnata su `<canvas>`: anno, libri letti, pagine, mese più intenso, genere più letto, e fino a 12 copertine dei libri letti (segnaposto colorati con l'iniziale se manca l'immagine: usa `clothTone`; le copertine vere arrivano dagli hook esistenti dei Libri solo se esportati dal loro `index.ts`, altrimenti solo segnaposto e dichiaralo). Colori e caratteri dell'app (attendi `document.fonts.ready`). "Salva immagine" → PNG tramite `platform.saveFile` (`bookeeper-<anno>.png`). Il disegno sta in una funzione pura che riceve dati e contesto 2D, provabile con un contesto finto.
4. Tutto si aggiorna quando un'altra vista invalida le statistiche di lettura.

## Test

- Schede e anno nell'indirizzo.
- Valori delle `StatCard`; dodici colonne con i valori; tabella equivalente.
- Calendario: 365 o 366 celle, intensità alle soglie, titolo accessibile.
- Anno vuoto.
- Disegno: con un contesto 2D finto, le chiamate contengono anno, numeri e al più 12 copertine; "Salva immagine" chiama `saveFile` con un PNG.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- `npm run build -w @bookeeper/desktop` passa.
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- Cambiano solo: file sotto `apps/desktop/src/modules/stats/`, i file i18n `stats.json`.
