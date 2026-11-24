Leggi prima `docs/forge/fase-1d/CONTRATTO.md` e i tre contratti che cita: regole, errori, tipi e rotte valgono anche qui.

# Rete: annuncio e scoperta via mDNS

## Obiettivo

Server e app in condivisione si annunciano in rete locale; il percorso "Unisciti" elenca ciò che trova (design §6.4). Qui nasce il codice condiviso, in `crates/bookeeper-net/src/mdns.rs`, con il crate `mdns-sd`. Firme nel contratto. Il collegamento al server arriva con la task `mdns-serve`; il lato desktop con la fase 2.

## Cosa fare

1. **Annuncio.** `announce(&Announcement)` registra un servizio `_bookeeper._tcp.local.`:
   - nome dell'istanza: `instance`, ripulito (niente caratteri di controllo, niente punti, al più 63 byte tagliando su un confine di carattere; vuoto → `Bookeeper`);
   - porta: `port`;
   - indirizzi: quelli delle interfacce attive, scelti da `mdns-sd`;
   - record TXT: `v=<version>`, `tls=<tls>`, `path=/api/v1`, e `url=<url>` solo se `url` è presente.
   Nessun altro dato: niente nomi di librerie, niente impronte, niente codici.
   `Announcer` tiene vivo l'annuncio; al `drop` lo ritira e ferma il demone, senza bloccare per più di un secondo.
2. **Scoperta.** `browse(timeout)` ascolta per `timeout` e restituisce i servizi risolti, senza doppioni (stessa istanza → una voce, con tutti gli indirizzi), ordinati per nome dell'istanza. Un record TXT assente dà stringa vuota (`version`, `tls`) o `None` (`url`). Valori TXT più lunghi di 255 byte o non UTF-8 sono scartati, non fanno fallire la scoperta.
3. **Funzioni pure**, pubbliche nel modulo, per poterle provare senza rete:
   - `sanitize_instance(&str) -> String`;
   - `txt_records(&Announcement) -> Vec<(String, String)>`;
   - `found_from_txt(instance, host, addrs, port, txt: &[(String, String)]) -> Found`.
4. Errori del demone o del sistema (porta 5353 non disponibile, nessuna interfaccia) → `NetError::Mdns` con il messaggio originale. Mai `panic`.

## Test

`crates/bookeeper-net/tests/mdns.rs`:

- `instance_names_are_sanitized`: punti e caratteri di controllo tolti; nome di 100 lettere accentate tagliato a ≤ 63 byte su un confine valido; vuoto → `Bookeeper`.
- `txt_records_carry_only_the_public_fields`: con e senza `url`; l'insieme delle chiavi è esattamente `v`, `tls`, `path` (più `url`).
- `found_is_built_from_txt`: record completi; record mancanti; valore non valido scartato.
- `announce_then_browse_finds_the_service` — `#[ignore]`, con commento "needs multicast": annuncia su una porta libera con un nome d'istanza casuale, `browse` per 3 secondi, trova quell'istanza con porta e TXT giusti; dopo il `drop` dell'`Announcer` una seconda `browse` non la trova più. Eseguilo a mano (`cargo test -p bookeeper-net --test mdns -- --ignored`) e scrivi nel rapporto se in questo ambiente passa o no: entrambe le risposte sono accettabili, tacere no.
- `announce_reports_errors_instead_of_panicking`: non forzare un errore artificiale; verifica solo che `announce` restituisca `Ok` o `Err(NetError::Mdns(_))` senza `panic`, e che il `drop` ritorni entro due secondi.

## Acceptance criteria

- `cargo test -p bookeeper-net --test mdns` passa (il test `#[ignore]` escluso).
- `cargo clippy -p bookeeper-net --all-targets -- -D warnings` è pulito.
- Le firme pubbliche coincidono con il contratto.
- Cambiano solo: `crates/bookeeper-net/src/mdns.rs`, `crates/bookeeper-net/tests/mdns.rs`. Se manca una dipendenza, fermati e dillo.
