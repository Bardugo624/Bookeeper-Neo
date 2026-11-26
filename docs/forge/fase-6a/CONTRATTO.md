# Contratto del run 6A

Valgono regole, convenzioni ed errori dei contratti delle fasi 1 e 4 (`docs/forge/fase-1a` … `fase-1e`, `docs/forge/fase-4a`). Qui ci sono solo le aggiunte. Dove i file divergono, vince questo.

## Regole aggiunte

- Tocca solo i file dichiarati per la tua task. Se ne serve un altro, fermati e dillo.
- Nessuna dipendenza nuova. Nessuna modifica a `Cargo.toml`.
- **Schema**: `0001_schema.sql` e `0002_reading_progress.sql` NON si modificano. Solo `people-api` aggiunge `0003_invites.sql`. Le colonne `books.owner_user_id`, `loans.borrower_user_id`, `wishlist.user_id` e la tabella `pairing_codes` (con `kind = 'invite'` e `role`) esistono già: leggile in `0001_schema.sql`.
- Convenzioni di sempre: `/api/v1`, JSON `snake_case`, UUID v7, secondi unix, errori `{error_code, message}`, `ApiJson`/`ApiQuery`, `db.run`, audit nella stessa transazione, isolamento per libreria (ciò che è di un'altra libreria risponde 404), ruolo letto dal database a ogni richiesta.
- Ogni rotta nuova è documentata con `utoipa`, con le risposte d'errore che può dare, e registrata in `openapi.rs` e in `api/mod.rs`.
- Ogni task del core che cambia la specifica aggiorna l'istantanea `packages/api/openapi.json` con `UPDATE_OPENAPI=1 cargo test -p bookeeper-core --test openapi`. `schema.d.ts` e le risorse del client le tocca solo `client-6a`.
- Compatibilità: i campi nuovi nelle risposte sono aggiunte; i parametri nuovi sono facoltativi; senza di essi le rotte esistenti si comportano come prima. I test esistenti restano verdi; si toccano solo dove un campo aggiunto cambia un confronto esatto.
- Il codice che tocchi è formattato con `rustfmt --edition 2021`: `cargo fmt --check` DEVE passare.

## Ruoli

| Ruolo | Può |
| --- | --- |
| ospite (`guest`) | leggere tutto ciò che la libreria mostra: libri, scaffali, prestiti, persone, wishlist di famiglia, statistiche; scrivere il proprio stato di lettura |
| membro (`member`) | + libri, copertine, collocazioni, scaffali, stanze, tag, prestiti, export, la propria wishlist, abbinare i propri dispositivi |
| admin (`admin`) | + persone (membri e ospiti), inviti come membro o ospite, tutti i dispositivi, import, backup, registro attività |
| proprietario (`owner`) | + admin (ruolo, rimozione, inviti come admin), ripristino, cambio proprietario |

**Chi gestisce chi.** Il proprietario gestisce tutti tranne sé stesso. Un admin gestisce membri e ospiti. Nessuno gestisce il proprietario. Gestire una persona vuol dire: cambiarne il ruolo (tra quelli che chi agisce può assegnare: il proprietario `admin|member|guest`, l'admin `member|guest`), cambiarne il nome, rimuoverla. Ognuno cambia il proprio nome. Ognuno, tranne il proprietario, può rimuovere sé stesso ("esci dalla libreria"). Fuori da queste regole: 403 `forbidden`.

## Persone (`people-api`)

```
PersonOut { id, display_name, role, is_me, created_at, last_seen | null, devices, email? }
```

`devices`: dispositivi non revocati. `last_seen`: il più recente tra i suoi dispositivi. `email` c'è solo se chi chiama è admin o proprietario e la persona ne ha una.

| Metodo e percorso | Chi | Effetto |
| --- | --- | --- |
| `GET /users` | ogni ruolo | `{items: [PersonOut]}`: proprietario, admin, membri, ospiti; poi per nome senza distinguere le maiuscole |
| `PATCH /users/{id}` | vedi "Chi gestisce chi" | corpo `{display_name?, role?}`; nome 1..60 dopo `trim`; `role` `owner` o sconosciuto → 422 `validation`; risponde `PersonOut` |
| `DELETE /users/{id}` | vedi "Chi gestisce chi" | 204 |
| `POST /users/{id}/owner` | solo il proprietario | la persona diventa proprietario, chi chiama diventa admin; 204; verso sé stesso → 422 `validation` |

Rimuovere una persona: i suoi dispositivi spariscono (le sessioni finiscono subito), con loro il suo stato di lettura, la sua wishlist e i codici che ha creato; `books.owner_user_id` e `loans.borrower_user_id` che la nominano tornano `NULL` (il nome nel prestito resta). Il cambio proprietario avviene in una transazione: prima chi chiama scende ad admin, poi l'altra persona sale (l'indice unico sul proprietario lo richiede).

Audit: `user.update` (con i campi cambiati), `user.remove` (con il nome), `library.owner` (con i due id).

## Inviti (`people-api`)

Migrazione `0003_invites.sql`: `ALTER TABLE pairing_codes ADD COLUMN id TEXT;` più un indice unico su `id` dove non è nullo. Ogni codice nuovo, di dispositivo o d'invito, riceve un UUID v7.

```
NewInvite      { role: "admin"|"member"|"guest", expires_in_days?: 1..30 }   // predefinito 7
InviteCreated  { id, code, role, expires_at }                               // il codice si vede solo qui
InviteOut      { id, role, created_by: {id, display_name}, created_at, expires_at }
CodeInfo       { kind: "device"|"invite", library_name, role | null, user_display_name | null, expires_at }
```

| Metodo e percorso | Chi | Effetto |
| --- | --- | --- |
| `POST /invites` | admin (ruoli `member|guest`), proprietario (anche `admin`) | 201 `InviteCreated`; stesso formato di codice dei dispositivi |
| `GET /invites` | admin, proprietario | `{items: [InviteOut]}`: solo quelli non usati e non scaduti, i più recenti prima |
| `DELETE /invites/{id}` | admin, proprietario | 204; sconosciuto, usato o scaduto → 404 `not_found` |
| `POST /pairing/inspect` | senza sessione | corpo `{code}`; risponde `CodeInfo` senza consumare il codice; `role` solo per gli inviti, `user_display_name` solo per i dispositivi |
| `POST /pairing/redeem` | senza sessione | come oggi, più `display_name?`: obbligatorio (1..60 dopo `trim`) per un invito, ignorato per un dispositivo |

Codice non valido, usato o scaduto: `inspect` e `redeem` rispondono come `redeem` oggi (401 `pairing_code_invalid`) e contano nello stesso limite di tentativi. Riscattare un invito, in una transazione: segna il codice usato, crea la persona con il ruolo dell'invito (senza email né password), crea il dispositivo, apre la sessione. Due riscatti concorrenti dello stesso codice: uno solo riesce. Risposta: lo stesso `AuthOut` di oggi. Audit: `invite.create`, `invite.revoke`, `user.join`.

## Di chi è, chi lo legge (`family-api`)

- `BookOut.owner: {id, display_name} | null` nell'elenco, nella ricerca e nel dettaglio. `NewBook` e `BookPatch` accettano `owner_user_id` (`null` lo toglie; persona di un'altra libreria o inesistente → 404 `not_found`). Scrivere il proprietario di un libro: chi può modificare i libri.
- Filtro `owner_id` su `GET /books` e sulla ricerca: un id, `me` oppure `none`. `GET /books/facets` guadagna `owners: [{id, display_name, count}]` (solo chi ha almeno un libro) e `owner_none` (numero).
- `GET /books/{id}/readers` (ogni ruolo) → `{items: [{user: {id, display_name}, is_me, status, started_at, finished_at}]}`: chi della libreria ha uno stato di lettura per quel libro. Ordine: `reading`, `to_read`, `read` (il più recente prima), `abandoned`. **Eccezione voluta al contratto 4A**: stato e date si mostrano alla famiglia; valutazione, nota e pagina corrente restano private e non compaiono mai.

## Wishlist di famiglia (`family-api`)

- `WishOut.user: {id, display_name}` sempre.
- `GET /wishlist?scope=mine|family` (predefinito `mine`, come oggi). `family`: le voci di tutte le persone; prima quelle di chi chiama, poi per nome della persona, poi l'ordine di oggi.
- Le scritture restano solo sulle proprie voci: modificare, eliminare o convertire una voce altrui → 404 `not_found`, come oggi.

## Prestiti a membri (`family-api`)

- `CreateLoan` e `PatchLoan` accettano `borrower_user_id` (nel `PATCH`, `null` lo toglie). Persona di un'altra libreria o inesistente → 404 `not_found`. Con `borrower_user_id`, `borrower_name` diventa facoltativo e il server salva il nome attuale della persona; senza l'uno né l'altro → 422 `validation`. Si può prestare anche a sé stessi.
- `LoanOut.borrower: {id, display_name} | null` (nome attuale), accanto a `borrower_name` e `borrower_user_id`.
- Filtro `borrower_user_id` su `GET /loans`: un id oppure `me`.

## Indice ISBN (`isbn-index-api`)

`GET /books/isbn-index?version=` (ogni ruolo) → `{version, unchanged, items: [{isbn, book_id, title, authors, shelf: {id, name} | null, row_index | null, slot_index | null}]}`.

- `isbn`: l'ISBN-13 del libro (solo cifre); se manca, ricavato dall'ISBN-10 con la funzione che il core già usa. Libri senza ISBN: assenti. Due copie dello stesso ISBN: due voci. Ordine: `isbn`, poi titolo.
- `version`: stringa opaca, l'impronta SHA-256 (`ring`) delle voci serializzate. Stessi dati, stessa versione; cambia quando cambia un titolo, un autore, un ISBN, una collocazione o il nome di un mobile.
- Se `version` nella richiesta è quella attuale: `{version, unchanged: true, items: []}`.

## Client (`client-6a`)

`packages/api` espone: `listUsers`, `updateUser`, `removeUser`, `transferOwnership`, `createInvite`, `listInvites`, `revokeInvite`, `inspectPairingCode` (nel client, accanto a `redeemPairingCode`), `listReaders`, `isbnIndex(version?)`, e i campi nuovi nei tipi.
