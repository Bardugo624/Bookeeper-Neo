Leggi prima `docs/forge/fase-4c/CONTRATTO.md`, `docs/forge/fase-3a/CONTRATTO.md`, `docs/forge/fase-4a/CONTRATTO.md` (rotte e tipi), `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`. Leggi `apps/mobile/src/kit`, `apps/mobile/src/modules/search` e i suoi test. Per il comportamento guarda il corrispondente desktop (`apps/desktop/src/modules/reading`, `apps/desktop/src/modules/tags`, `apps/desktop/src/modules/books`): si legge, non si importa.

# PWA: stato di lettura

## Cosa fare

1. Cartella nuova `apps/mobile/src/modules/reading` con i punti di contatto del contratto.
2. **Scheda del libro** (`BookDetailPage`): blocco "Lettura" subito dopo "Dove si trova" e prestito. Mostra stato, anello con la percentuale (se in lettura e il libro ha un numero di pagine), pagina corrente, date, valutazione.
   - Senza stato: tre scelte dirette "Da leggere", "Sto leggendo", "Letto".
   - Con stato: bottone "Cambia stato" che apre un `BottomSheet` con i quattro stati e "Togli lo stato" (`DELETE`).
   - In lettura: campo pagina con `−` e `+` e tastiera numerica (`inputmode="numeric"`); mai oltre il numero di pagine; bottone "Segna come letto".
   - Letto o abbandonato: valutazione a cinque stelle (gruppo di radio accessibile, toccare la stella attiva la toglie) e nota (salvata all'uscita dal campo, solo se cambiata, mai se di soli spazi).
3. **Scritture ottimistiche** con ripristino in caso d'errore e messaggio da `apiErrorMessage`. Due tocchi rapidi su `+` non fanno mai tornare indietro il numero: la risposta di un salvataggio superato non sovrascrive il valore più recente. Se il salvataggio della nota fallisce, il testo scritto resta nel campo.
4. Se lo stato di lettura non si carica, il blocco mostra l'errore con "Riprova" e nessun comando di scrittura: mai una scrittura che cancelli valutazione e nota non lette.
5. **Elenco della ricerca** (`BookRow`): `ReadingBadge` a destra della riga: anello piccolo con percentuale per "in lettura", spunta per "letto", niente per gli altri. Ha un nome accessibile.

## Test

- Blocco: senza stato, ogni stato, cambio stato dal foglio, togli stato.
- Pagina: `+`, `−`, limite alle pagine del libro, due `+` rapidi con risposte in ordine inverso.
- Stelle: scegli, togli. Nota: salva all'uscita, non salva se invariata o di soli spazi, resta dopo un errore.
- Errore di caricamento: nessun comando di scrittura.
- Riga dell'elenco: anello, spunta, niente.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/mobile`, `npm test -w @bookeeper/mobile` e `npm run build -w @bookeeper/mobile` passano.
- `npm test -w @bookeeper/i18n` e `npm test -w @bookeeper/ui` passano (chiavi nelle due lingue, nessuna collisione di nomi di file).
- Nessun componente supera 250 righe. Nessun testo dell'interfaccia scritto nei componenti. Nessuna chiamata al client dentro un componente.
- A 320px di larghezza nessuno scorrimento orizzontale; bersagli tattili di almeno 44×44px; campi con testo di almeno 16px.
- Cambiano solo: file sotto `apps/mobile/src/modules/reading/`, `apps/mobile/src/modules/search/`, i file i18n `mreading.json` e `msearch.json` (it e en).
