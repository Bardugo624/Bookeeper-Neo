Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/src/kit`, il modulo che tocchi e i suoi test. Per il comportamento guarda il modulo corrispondente del desktop: si legge, non si importa. Leggi `apps/mobile/src/modules/scan` per intero.

# PWA: wishlist

## Cosa fare

1. Modulo nuovo `apps/mobile/src/modules/wishlist` con la scheda "Wishlist" nella barra in basso (dopo "Prestiti") e la rotta `/wishlist`: scelta "La mia" | "Famiglia" (`?scope=family`). Un ospite vede solo "Famiglia". "Famiglia" è raggruppata per persona come nel desktop.
2. `AddWishSheet`, esportato: titolo (obbligatorio), autore, ISBN, priorità. Invia `POST /wishlist`. Bottone "Aggiungi" nella pagina, per chi può scrivere.
3. Tocco su una propria voce: foglio con "Modifica", "Elimina" (con conferma) e "Ce l'ho: aggiungilo alla libreria", che converte (`POST /wishlist/{id}/convert`) e apre la scheda del libro nuovo. Le voci altrui sono in sola lettura.
4. **Scansione**: quando il libro letto non è nella libreria e la ricerca dell'ISBN l'ha trovato, il foglio offre anche "Aggiungi alla wishlist", con i dati trovati.

## Test

- Scelta e gruppi; ospite.
- Aggiunta; modifica; eliminazione; conversione con apertura della scheda.
- Voci altrui senza comandi.
- Dalla scansione: comando presente solo per un libro trovato e non posseduto.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- A 320px nessuno scorrimento orizzontale della pagina; bersagli tattili di almeno 44×44px; campi con testo di almeno 16px.
- Cambiano solo: file sotto `apps/mobile/src/modules/wishlist/` (nuovo) e `apps/mobile/src/modules/scan/`, i file i18n `mwishlist.json` (nuovo) e `mscan.json` (it e en).
