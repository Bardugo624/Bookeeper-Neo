# Mettere il server in rete

Questa guida porta `bookeeper-server` dal primo avvio all'uso quotidiano. Per usare Bookeeper solo sul tuo computer non serve: basta l'app desktop.

## Prima di cominciare: il telefono vuole HTTPS

La PWA sul telefono si apre solo se il server ha un **indirizzo HTTPS con certificato valido**, per esempio `https://libri.example.org`. Il telefono rifiuta di scansionare e di installare l'app su un indirizzo `http://` o con un certificato autofirmato.

In pratica:

- Ti serve un **nome di dominio** che punta al server (o un servizio tunnel che te ne dà uno).
- Il server può avere il certificato da solo (modalità `acme`) oppure lo ha un proxy davanti (modalità `off`).
- Un PC di casa raggiunto solo in rete locale, o un server in modalità `self`, funziona per i computer con l'app desktop. Per il telefono no.
- Chi non ha un dominio può usare un servizio tunnel di terze parti che espone `http://127.0.0.1:7842` con un indirizzo HTTPS. Poi imposta quell'indirizzo come `BOOKEEPER_PUBLIC_URL`. Il tunnel è un servizio esterno: segui le sue istruzioni.

## Le variabili

Ogni opzione è una variabile `BOOKEEPER_*` o un flag. L'elenco completo è in `bookeeper-server --help`.

| Variabile | Flag | Cosa fa | Predefinito |
| --- | --- | --- | --- |
| `BOOKEEPER_DATA` | `--data-dir` | Cartella dei dati | `./data` (`/data` in Docker) |
| `BOOKEEPER_BIND` | `--bind` | Indirizzo su cui ascolta | `0.0.0.0` |
| `BOOKEEPER_PORT` | `--port` | Porta | 443 con `acme`, altrimenti 7842 |
| `BOOKEEPER_TLS` | `--tls` | `off`, `self` o `acme` | `off` |
| `BOOKEEPER_DOMAIN` | `--domain` | Nomi DNS, separati da virgola; il primo è quello dato ai telefoni | nessuno |
| `BOOKEEPER_ACME_EMAIL` | `--acme-email` | Email per l'account del certificato | nessuna |
| `BOOKEEPER_ACME_DIRECTORY` | `--acme-directory` | Indirizzo ACME | Let's Encrypt |
| `BOOKEEPER_PUBLIC_URL` | `--public-url` | Indirizzo che i telefoni devono usare | `https://<dominio>` con `acme` |
| `BOOKEEPER_MDNS` | `--mdns` | `on` o `off`: annuncio in rete locale | `on` (`off` in Docker) |

Le tre modalità TLS:

- **`off`**: il server parla HTTP semplice. Va dietro un proxy che mette l'HTTPS. È la modalità predefinita.
- **`acme`**: il server ottiene da solo il certificato (Let's Encrypt). Serve `BOOKEEPER_DOMAIN`, la porta 443 raggiungibile da Internet e il nome che punta a questa macchina.
- **`self`**: certificato autogenerato, tenuto nella cartella dati. Solo per la rete di casa e per i computer con l'app desktop. Niente telefono.

## Con Docker

Serve Docker con il plugin `docker compose`. Dalla cartella del progetto:

```bash
docker compose up -d
docker compose logs bookeeper
```

Il server risponde su `http://<indirizzo>:7842`. Nei log trovi il **codice di setup**.

Il file `docker-compose.yml` ha un servizio, un volume (`bookeeper-data`, montato in `/data`) e la porta 7842.

### Con un dominio e HTTPS automatico

Nel servizio sostituisci `ports` e aggiungi `environment` (c'è già un esempio commentato nel file):

```yaml
    ports:
      - "443:443"
    environment:
      BOOKEEPER_TLS: acme
      BOOKEEPER_DOMAIN: libri.example.org
      BOOKEEPER_ACME_EMAIL: tu@example.org
```

Poi `docker compose up -d`. Se la porta 443 non è raggiungibile da Internet, il certificato non viene emesso.

### Dietro un proxy

Lascia `BOOKEEPER_TLS: "off"` e pubblica la porta solo sull'indirizzo locale. È quello che fa il server di produzione (`ops/vps/deploy/docker-compose.yml`):

```yaml
    environment:
      BOOKEEPER_TLS: "off"
      BOOKEEPER_PUBLIC_URL: https://libri.example.org
    ports:
      - "127.0.0.1:7842:7842"
```

### Salute e volume

L'immagine controlla da sola lo stato del server (`bookeeper-server healthcheck`). Vedi il risultato con `docker compose ps`.

I dati stanno nel volume `bookeeper-data`. `docker compose down` li lascia; `docker compose down -v` li cancella.

## Con il binario

Scarica l'archivio del tuo sistema dalla [pagina delle release](https://github.com/Bardugo624/Bookeeper-Neo/releases), scompattalo, entra nella cartella `bookeeper-server-<versione>-<sistema>/` e avvia:

```bash
cd bookeeper-server-*/
./bookeeper-server
```

Senza configurazione crea la cartella `./data`, ascolta sulla porta 7842 e stampa il codice di setup:

```text
Codice di setup: Z968-7D4R-VEWU
Bookeeper 2.0.0-beta.1 in ascolto su http://0.0.0.0:7842
```

Altri comandi utili. `setup-code` e `fingerprint` leggono la cartella dati da `--data-dir` (o da `BOOKEEPER_DATA`): deve essere quella del server in esecuzione, altrimenti usano un altro database.

```bash
./bookeeper-server --version
./bookeeper-server --help
./bookeeper-server --data-dir /var/lib/bookeeper --port 8080
./bookeeper-server healthcheck      # esce con 0 se il server risponde
./bookeeper-server setup-code --data-dir ./data   # stampa un nuovo codice di setup
./bookeeper-server fingerprint --data-dir ./data  # impronta del certificato `self`
```

Nella cartella dati ci sono `bookeeper.sqlite` (i dati), `covers/` (le copertine) e `backups/` (i backup automatici). Con `--tls self` c'è anche `tls/`; con `acme` la cache dei certificati sta in `tls/acme`.

Con `acme` la porta 443 è privilegiata. Con il servizio systemd qui sotto aggiungi `AmbientCapabilities=CAP_NET_BIND_SERVICE` alla sezione `[Service]` (il permesso sul file con `setcap` non basta, perché `NoNewPrivileges=true` lo ignora). Oppure metti un proxy davanti.

### Come servizio di sistema (systemd)

Copia il binario in `/usr/local/bin` e crea un utente dedicato:

```bash
sudo useradd --system --home /var/lib/bookeeper --create-home --shell /usr/sbin/nologin bookeeper
sudo install -m 755 bookeeper-server /usr/local/bin/bookeeper-server
```

Crea `/etc/systemd/system/bookeeper.service`:

```ini
[Unit]
Description=Bookeeper server
After=network-online.target
Wants=network-online.target

[Service]
User=bookeeper
Group=bookeeper
Environment=BOOKEEPER_DATA=/var/lib/bookeeper
Environment=BOOKEEPER_TLS=off
Environment=BOOKEEPER_PORT=7842
Environment=BOOKEEPER_BIND=127.0.0.1
Environment=BOOKEEPER_MDNS=off
ExecStart=/usr/local/bin/bookeeper-server
Restart=on-failure
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/bookeeper

[Install]
WantedBy=multi-user.target
```

Avvialo e leggi il codice di setup:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bookeeper
sudo journalctl -u bookeeper -n 20
```

`BOOKEEPER_BIND=127.0.0.1` va bene dietro un proxy sulla stessa macchina. Per usare il server dalla rete togli la riga.

## Dietro un proxy (Caddy)

Caddy mette l'HTTPS e gira verso il server. Il server resta in modalità `off`, con `BOOKEEPER_PUBLIC_URL` uguale all'indirizzo pubblico. Il file reale del progetto è `ops/vps/deploy/bookeeper.caddy`:

```caddyfile
libri.example.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:7842
}
```

Ricarica Caddy dopo la modifica (`sudo systemctl reload caddy`). Se hai più nomi, scrivili separati da virgola come fa il file di esempio.

Qualunque altro proxy va bene, purché giri le richieste a `127.0.0.1:7842` e serva HTTPS valido.

## Primo avvio

1. Avvia il server e leggi il **codice di setup** (nei log; con Docker `docker compose logs bookeeper`). Se serve un codice nuovo: `docker compose exec bookeeper /usr/local/bin/bookeeper-server setup-code`, oppure con il servizio systemd `sudo -u bookeeper bookeeper-server setup-code --data-dir /var/lib/bookeeper`. Il codice compare all'avvio finché non esiste alcuna libreria.
2. Apri l'app desktop e scegli **Crea su un server**. Scrivi l'indirizzo, il codice di setup, il nome della libreria, il tuo nome, email e password. Il tuo computer è abbinato e tu sei il proprietario.
3. **Aggiungere un dispositivo** (per te): nella sezione Dispositivi della barra laterale scegli «Aggiungi un computer» o «Aggiungi un telefono». Compare un codice di 8 caratteri, valido 10 minuti, usabile una volta. Per il telefono c'è anche il QR: apre la PWA e abbina senza digitare. Il pulsante del telefono compare solo se il server ha un HTTPS valido.
4. **Aggiungere persone**: nella sezione Persone invita un familiare con un ruolo (admin, membro, ospite). Chi riceve l'invito sceglie nome, email e password.
5. Con `--tls self`, la prima volta che un computer si unisce vede una **frase di verifica**. Deve essere uguale a quella che stampa il server con `fingerprint` (con systemd: `sudo -u bookeeper bookeeper-server fingerprint --data-dir /var/lib/bookeeper`; con Docker: `docker compose exec bookeeper /usr/local/bin/bookeeper-server fingerprint`).

## Aggiornare il server

Con Docker scarica la nuova immagine e riavvia:

```bash
docker compose pull
docker compose up -d
```

Con il binario ferma il servizio, sostituisci il file e riavvia:

```bash
sudo systemctl stop bookeeper
sudo install -m 755 bookeeper-server /usr/local/bin/bookeeper-server
sudo systemctl start bookeeper
```

I dati restano nella cartella dati o nel volume. Fai un backup prima di una versione nuova.

## Backup e ripristino

Il server fa da solo un **backup automatico** ogni 3 giorni e tiene gli ultimi 5, in `backups/` dentro la cartella dati. Intervallo e numero si cambiano dalla sezione Backup delle Impostazioni. Con intervallo 0 i backup automatici sono spenti.

Dalla stessa sezione puoi anche creare un backup a mano: è un file `.zip` con libri, scaffali, stanze, etichette, prestiti, stato di lettura, lista dei desideri e copertine. Conservalo fuori dal server.

Il **ripristino** si fa dalla stessa pagina («Ripristina da file…»). Lo può fare solo il proprietario e sostituisce tutti i dati attuali della libreria. Non si può annullare.

Per copiare l'intera cartella dati (per esempio su un altro disco), ferma prima il server. Con il server acceso il database può essere a metà di una scrittura.

```bash
sudo systemctl stop bookeeper
tar czf bookeeper-dati.tar.gz -C /var/lib/bookeeper .
sudo systemctl start bookeeper
```

Con Docker il volume si copia così:

```bash
docker compose stop bookeeper
docker run --rm -v bookeeper_bookeeper-data:/data -v "$PWD":/out alpine tar czf /out/bookeeper-dati.tar.gz -C /data .
docker compose start bookeeper
```

Il nome del volume è `<cartella del progetto>_bookeeper-data`: controllalo con `docker volume ls`.
