Leggi prima `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Ogni correzione ha un test che fallisce prima e passa dopo.

# App: due difetti P3, caratteri, avatar, peso del testo

Le task `ui-fix` e `i18n-fix` sono già unite.

## Difetti da correggere

1. **Rinnovo fallito per errore di rete ricordato per sempre** (`apps/desktop/src/session/authTransport.ts`, riga 61 circa): `failedRefresh` registra ogni fallimento, anche un errore di rete su `/auth/refresh`; quel token non viene più provato per tutta la sessione. Regola: si ricorda come fallito solo un rinnovo rifiutato dal server (risposta 4xx). Un errore di rete o un 5xx non marca il token: al tentativo successivo si riprova.
2. **Libreria locale cancellata durante il controllo iniziale** (`apps/desktop/src/modules/welcome/useLocalLibrary.ts`, righe 22-35): creare la libreria mentre il controllo di setup è ancora in corso può rimuovere la connessione appena creata. Regola: la pulizia della connessione temporanea rimuove solo la connessione che quel controllo ha creato, e solo se nel frattempo non è diventata la connessione di una sessione avviata; finché il controllo è in corso il bottone "Crea la libreria" è in `loading`.
3. **`Button loading` senza etichetta**: dopo `ui-fix` non compila. Ogni uso passa un'etichetta da i18n.
4. **Caratteri**: `main.tsx` importa `@bookeeper/ui/fonts.css` prima di `tokens.css`.
5. **Fornitori**: l'app monta un solo `TooltipProvider` e un solo `ToastProvider` attorno al router, se non ci sono già.
6. **Avatar della libreria** (`shell`): come nel mockup mostra l'iniziale del nome della persona, non della libreria. Senza nome, l'iniziale della libreria.
7. **Schede del primo avvio** (`modules/welcome`): la riga di descrizione sotto il titolo di ogni scheda è in peso normale (400) e colore `--bk-text-muted`; il titolo resta in peso 600. Controlla lo stesso per il testo sotto "I tuoi libri, in ordine.".
8. **Richieste di copertina che rispondono 404**: per un libro senza copertina la vista Libri chiede comunque l'immagine e riceve 404, una per card. Leggi `BookOut` e l'API delle copertine nel core: se la risposta dell'elenco permette di sapere che la copertina manca, non fare la richiesta; se non lo permette, lascia com'è e dichiaralo nel rapporto, indicando quale campo servirebbe.

## Test

- Rinnovo: 401 su `/me`, errore di rete sul rinnovo, poi nuovo tentativo → il rinnovo viene riprovato; rinnovo con risposta 401 → non viene riprovato.
- Libreria locale: creazione avviata mentre il controllo è pendente → alla fine la connessione esiste ed è attiva, stato `ready`.
- Avatar: persona "Giulia", libreria "Casa Rossi" → "G"; senza nome → "C".
- Un solo `TooltipProvider` nell'albero dell'app.
- I test esistenti restano verdi.

## Acceptance criteria

- `npm run typecheck -w @bookeeper/desktop` e `npm test -w @bookeeper/desktop` passano.
- `npm test -w @bookeeper/i18n` passa.
- `npm run build -w @bookeeper/desktop` passa e la cartella `apps/desktop/dist` contiene file di carattere `.woff2`.
- Cambiano solo file sotto `apps/desktop/src/` e `packages/i18n/src/locales/`.
