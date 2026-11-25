Leggi prima `docs/forge/fase-2b/CONTRATTO.md`, `docs/forge/fase-2a/CONTRATTO.md` e `docs/forge/fase-2a/MOCKUP.md`: regole, nomi e aspetto valgono anche qui. Ogni correzione ha un test che fallisce prima e passa dopo.

# Cinque difetti P3 del run 2A1

1. **`packages/ui/src/styleCheck.ts:35`** — un colore con nome usato come ripiego di `var()` non viene rilevato, perché `var(...)` è rimosso prima della ricerca. Regola: si rimuove solo il nome della variabile; il ripiego dentro `var(--x, red)` viene controllato come ogni altro valore, anche annidato.
2. **`packages/ui/src/overlays/Dialog.tsx:40`** — il ripiego "elemento precedente più vicino" funziona solo se chi ha aperto il dialog corrisponde al selettore degli elementi focalizzabili; altrimenti il fuoco va al primo elemento della pagina. Regola: si ricorda la posizione nel documento dell'elemento che aveva il fuoco all'apertura (anche se non focalizzabile da selettore) e alla chiusura, se non esiste più, si sceglie l'ultimo elemento focalizzabile che lo precedeva nel documento.
3. **`apps/desktop/src-tauri/src/connections.rs:152`** — si controlla che il nome sia libero e poi si rinomina: due processi possono scegliere lo stesso nome e uno sovrascrive l'altro. Regola: il file messo da parte si crea in modo esclusivo (creazione che fallisce se il nome esiste, per esempio `hard_link` seguito dalla rimozione dell'originale, oppure `OpenOptions::create_new` con copia); su conflitto si prova il nome successivo.
4. **`apps/desktop/src/modules/welcome/useCreateLocal.ts:36`** — codice lasciato a metà: un commento su una creazione ancora in corso, una riga vuota con spazi, e `settled()` in `useLocalLibrary.ts:48` mai chiamata. Regola: la creazione attende `settled()` prima di procedere; niente codice morto.
5. **`apps/desktop/src/modules/welcome/useLocalLibrary.ts:37`** — la pulizia guarda la connessione della sessione solo nell'istante in cui il controllo finisce: se `signIn` ha già salvato e attivato la connessione ma lo stato non è ancora aggiornato, la pulizia rimuove la connessione nuova. Regola: la pulizia rimuove solo la connessione temporanea che il controllo stesso ha creato, riconosciuta per id, e mai una connessione che ha un token salvato; rilegge le connessioni dalla piattaforma al momento di rimuovere.

## Test

- `styleCheck`: `var(--x, red)` e `var(--a, var(--b, #fff))` rifiutati; `var(--x)` e `var(--x, transparent)` accettati.
- `Dialog`: aperto da un elemento non focalizzabile da selettore che poi sparisce → il fuoco va all'elemento focalizzabile precedente, non al primo della pagina.
- `connections`: con il nome già occupato il file esistente resta intatto e il nuovo prende il nome successivo; due `Store` sulla stessa cartella che mettono da parte nello stesso secondo producono due file.
- `welcome`: creazione avviata durante il controllo → `settled()` attesa; la risposta del controllo che arriva dopo `signIn` non rimuove la connessione.

## Acceptance criteria

- `npm test -w @bookeeper/ui`, `npm test -w @bookeeper/desktop`, `npm run typecheck -w @bookeeper/ui -w @bookeeper/desktop` passano.
- `cargo test -p bookeeper-desktop --test connections` e `cargo clippy -p bookeeper-desktop --all-targets -- -D warnings` passano.
- Cambiano solo: `packages/ui/src/styleCheck.ts`, `packages/ui/src/styleCheck.test.ts`, `packages/ui/src/overlays/Dialog.tsx`, `packages/ui/src/overlays/Dialog.test.tsx`, `apps/desktop/src-tauri/src/connections.rs`, `apps/desktop/src-tauri/tests/connections.rs`, file sotto `apps/desktop/src/modules/welcome/`.
