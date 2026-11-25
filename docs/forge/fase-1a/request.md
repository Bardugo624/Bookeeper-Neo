# Richiesta

Richiesta del proprietario, alla lettera:

> procedi usando Forge, tu Fable generi le task
>
> https://github.com/Giamme/forge — devi usare questo per le task

Ambito scelto dal proprietario: fase 1 del design `docs/superpowers/specs/2026-11-20-bookeeper-2.0-design.md` (core Rust e deployment). Implementatore: `sonnet`. Revisore: `opus`. Niente Fractal. forge-ui attivo.

## Questo run: fase 1A — accesso

La fase 1 è divisa in quattro run concatenati. Questo è il primo.

| Run | Contenuto |
| --- | --- |
| **1A** | Fondamenta del core, autenticazione a token, setup, abbinamento, dispositivi, limiti di tentativi, client API. |
| 1B | Risorse a parità con la 0.3: libri con ricerca, scaffali, prestiti, wishlist, statistiche. |
| 1C | Lookup ISBN, copertine lato server, import/export, backup, etichette PDF. |
| 1D | TLS `off`/`acme`/`self`, mDNS, Docker, workflow di rilascio. |

## Requisiti di 1A (design §6.2 e §6.4)

1. Un dispositivo abbinato possiede un token di rinnovo opaco a rotazione; il server ne conserva solo l'hash. Il riuso di un token già ruotato revoca il dispositivo.
2. Le richieste portano un token di accesso JWT a vita breve (15 minuti).
3. "Crea qui" (app desktop, core in processo) non chiede password né codice.
4. "Crea su un server" richiede un codice di setup che il server stampa all'avvio finché non esiste alcuna libreria, e che si rigenera con `bookeeper-server setup-code`.
5. "Unisciti" funziona con email e password, oppure con un codice di abbinamento di 8 caratteri, monouso, valido 10 minuti, generato da un dispositivo già collegato.
6. Su un server con più librerie, email e password identificano la libreria senza elenco pubblico delle librerie.
7. Revoca ed elenco dei dispositivi.
8. Login, abbinamento e setup hanno un limite di tentativi.
9. Ogni errore utente ha un `error_code` stabile. Un corpo JSON malformato risponde con `error_code`, non con testo semplice.
10. L'accesso al database dalle rotte non blocca il thread che serve le richieste.
11. Il client TypeScript in `packages/api` espone tutte le rotte nuove, con tipi generati dalla specifica OpenAPI.

Fuori da 1A: inviti con ruolo e gestione delle persone (fase 6), TLS e mDNS (1D).
