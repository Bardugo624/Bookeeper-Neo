Leggi prima `docs/forge/fase-6b/CONTRATTO.md`, `docs/forge/fase-6a/CONTRATTO.md` (rotte, tipi, ruoli), `docs/forge/fase-4b/CONTRATTO.md`, `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/desktop/src/kit` e il modulo che tocchi, con i test. Le task `d-notify` e `d-loans-members` sono già unite: parti dal loro codice. Leggi `apps/desktop/src/shell` e `apps/desktop/src/app/types.ts`.

# Desktop: prestiti scaduti

## Cosa fare

1. `useOverdueCount()` nel modulo prestiti: `GET /loans?status=overdue&limit=1`, ne usa `total`. Si aggiorna ogni 5 minuti, al ritorno del fuoco sulla finestra e dopo ogni scrittura sui prestiti. Esportato da `index.ts`.
2. **Badge**: `NavItem.useBadge` e `badgeLabelKey`, come da contratto. La barra laterale chiama `useBadge` in un componente per voce e mostra il numero accanto a "Prestiti" quando è maggiore di zero, con nome accessibile "3 prestiti scaduti" (forme plurali). Tono d'avviso dei token. Lo vede ogni ruolo.
3. **Notifica**: un componente `overlay` del modulo prestiti controlla all'avvio e poi ogni ora. Manda al più una notifica al giorno per libreria, se l'avviso è acceso (`useOverdueAlerts`), il permesso è concesso e chi chiama può scrivere (`can('write')`). Titolo "Prestiti scaduti"; testo con al più tre prestiti ("«Dune» · Marco · da 3 giorni") e "e altri N". La data dell'ultimo invio sta nello spazio locale, per libreria, con try/catch.
4. Nessuna notifica senza prestiti scaduti, senza permesso, ad avviso spento o dove `notifications` è `null`.

## Test (orologio finto)

- Conteggio e aggiornamento dopo una scrittura.
- Badge con numero e nome accessibile; assente a zero.
- Notifica: una sola volta al giorno; testo con tre prestiti e il resto; nessun invio senza permesso, ad avviso spento, per un ospite, senza scaduti; spazio locale non disponibile.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop`, `npm test -w @bookeeper/desktop` e `npm run build -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia nei componenti. Nessuna chiamata al client dentro un componente. Nessun colore letterale nei fogli di stile.
- Cambiano solo: file sotto `apps/desktop/src/modules/loans/`, `apps/desktop/src/app/types.ts`, file sotto `apps/desktop/src/shell/`, i file i18n `loans.json` e `shell.json` (it e en).
