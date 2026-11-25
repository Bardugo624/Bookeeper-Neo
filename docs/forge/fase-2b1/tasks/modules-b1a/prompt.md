Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e i contratti della fase 1 che riguardano i file che tocchi. Ogni correzione ha un test che fallisce prima e passa dopo. La task `ui-b1` è già unita: il toast condiviso accetta `action`.

# Wishlist, statistiche, dispositivi, prestiti: sei difetti

1. **Wishlist, avviso di conversione** (`modules/wishlist/ConvertedNotice.tsx:21`): si chiude dopo 8 secondi fissi anche col fuoco sopra. Regola: l'avviso proprio sparisce; si usa il toast condiviso con `action` "Apri" che porta al libro. Rimuovi il componente se non serve più.
2. **Wishlist, errore che resta** (`modules/wishlist/useWishActions.ts:24`): l'errore di un'azione fallita resta a schermo dopo un'azione riuscita. Regola: ogni azione nuova azzera l'errore precedente.
3. **Statistiche, codici di lingua e formato** (`modules/stats/StatsPage.tsx:72`): il confronto è sensibile alle maiuscole; `IT` non viene tradotto. Regola: la chiave si normalizza (spazi tolti, minuscolo) prima di cercare la traduzione; due righe che dopo la normalizzazione coincidono si sommano in una.
4. **Dispositivi, gettone di conferma perso** (`modules/devices/useDeviceActions.ts:25`): la revoca ignora il gettone restituito da `usePasswordConfirm`. Regola: `revokeDevice` di `@bookeeper/api` accetta un gettone facoltativo e lo manda nell'intestazione che il core si aspetta (leggila in `crates/bookeeper-core/src/api/confirm.rs`); la revoca passa il gettone alla ripetizione. Controlla allo stesso modo ogni altra azione dei quattro moduli che usa `usePasswordConfirm`.
5. **Dispositivi, "Copiato" che resta** (`modules/devices/CodeBlock.tsx:18`): dopo "Genera un nuovo codice" il bottone dice ancora "Copiato". Regola: lo stato torna a "Copia" quando il codice cambia, e comunque dopo 2 secondi.
6. **Prestiti, iniziale con stile di collegamento** (`modules/loans`): nelle card la copertina è dentro un link e l'iniziale del segnaposto eredita colore e sottolineatura del collegamento. Regola: il link che avvolge la copertina non ha decorazione e non cambia il colore del contenuto; ha comunque anello di fuoco e nome accessibile. Controlla lo stesso negli altri tre moduli.

## Test

- Wishlist: dopo la conversione c'è un toast con il bottone "Apri" che porta a `/books/<id>`; un errore di eliminazione sparisce dopo un'aggiunta riuscita.
- Statistiche: `IT` e `it` diventano una riga sola con la somma e l'etichetta tradotta.
- Dispositivi: `confirmation_required` alla revoca → password → la ripetizione porta l'intestazione col gettone; "Copiato" torna a "Copia" con codice nuovo e dopo 2 secondi (timer finti).
- `client.test.ts`: `revokeDevice(id, token)` manda l'intestazione; senza gettone non la manda.
- Prestiti: il link della copertina ha la classe che toglie la decorazione (test sul `.module.css`: `text-decoration: none` e `color: inherit`) e un nome accessibile.

## Acceptance criteria

- `npm run typecheck` e `npm test` dalla radice passano.
- `npm run build -w @bookeeper/desktop` passa.
- Cambiano solo: file sotto `apps/desktop/src/modules/{wishlist,stats,devices,loans}/`, `packages/api/src/client.ts`, `packages/api/src/client.test.ts`.
