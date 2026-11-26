Leggi prima `docs/forge/fase-6b1/CONTRATTO.md`, `docs/forge/fase-6b/CONTRATTO.md` e `docs/forge/fase-6a/CONTRATTO.md`. Leggi ogni file citato e i suoi test prima di cambiarlo. La task `p3-6b-mobile-a` è già unita. Leggi `apps/mobile/src/modules/pair` (`CodePage.tsx`, `usePairing.ts`), `apps/mobile/src/modules/scan/useIsbnLookup.ts` e `apps/mobile/src/modules/wishlist` (`AddWishSheet.tsx`, `WishSheet.tsx`).

# PWA: abbinamento, scansione senza rete, wishlist

1. **Indietro dall'invito** (`pair/CodePage.tsx`, circa riga 26): quando il codice scritto è un invito, il passo del nome non ha un modo per tornare al codice. Regola: "Indietro" torna al modulo del codice, con il codice ancora scritto.
2. **Nome del telefono vuoto** (`pair/usePairing.ts`, circa riga 83): il controllo del nome vuoto avviene dopo `inspectPairingCode`, quindi con il nome vuoto si fa una richiesta inutile. Regola: il controllo viene prima di ogni richiesta.
3. **Senza rete e senza libreria nota** (`scan/useIsbnLookup.ts`, circa riga 84): se l'id della libreria non è ancora salvato e il telefono è senza rete, il foglio della scansione gira per sempre. Regola: si mostra il foglio senza rete con "Non ho ancora scaricato l'elenco dei libri della libreria."
4. **Aggiunta che finisce dopo la chiusura** (`wishlist/AddWishSheet.tsx`, circa riga 30): un'aggiunta che termina dopo che il foglio è stato chiuso chiama ancora `onDone`, e dalla scansione chiude il foglio del risultato. Regola: dopo la chiusura, `onDone` non si chiama più.
5. **Errore che resta** (`wishlist/WishSheet.tsx`, circa riga 82): l'errore di una conversione fallita resta visibile passando a "Modifica". Regola: cambiare passo cancella l'errore.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano.
- Bersagli tattili di almeno 44×44px; nessuno scorrimento orizzontale a 320px.
- Cambiano solo: file sotto `apps/mobile/src/modules/pair/`, `apps/mobile/src/modules/scan/`, `apps/mobile/src/modules/wishlist/`, i file i18n `mpair.json`, `mscan.json` e `mwishlist.json` (it e en).
