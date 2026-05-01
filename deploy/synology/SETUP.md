# Bookeeper Neo — Synology DSM 7.2+ setup

> Tested on DSM 7.2.1 with Container Manager. Older DSM 7.0/7.1 installations
> using the legacy *Docker* package are **not supported** — the YAML parser is
> too old to handle Compose v3.x reliably.

## 1. Preparation

1. Open **Package Center → Container Manager → Install** (if not already).
2. Open **File Station** and create the folder:
   `/docker/bookeeper/`
   then inside it create:
   - `data/` — SQLite + uploads volume
   - `certs/` — TLS material
3. Copy `docker-compose.yml` and `Caddyfile` from this repo's `deploy/`
   folder into `/docker/bookeeper/`.

## 2. (Optional) Hostname

If you want the friendly URL `https://bookeeper.local:8443`, set a static
DHCP reservation for the NAS in your router and add a DNS entry on your
router (or set `SERVER_HOST=<your-NAS-IP>` in the env file below).

## 3. Environment

Create `/docker/bookeeper/.env`:

```env
SERVICE_NAME=Bookeeper
SERVER_HOST=bookeeper.local
```

## 4. Start the stack

In Container Manager:

1. **Project → Create**
2. Project name: `bookeeper`
3. Path: `/docker/bookeeper`
4. Source: **Use existing docker-compose.yml**
5. Click **Next → Done** and **Build**

Container Manager will pull the image from GHCR and start the stack.

## 5. Auto-restart on NAS reboot

In **Container Manager → Container** select each container
(`bookeeper-server`, `bookeeper-caddy`) and ensure **Enable auto-restart** is
ticked. The `restart: unless-stopped` policy in the compose file already
sets this; the toggle is a DSM-level safety net.

## 6. First-time setup

Hit the bootstrap surface from any browser on the LAN:

```
https://<nas>:8080/setup/tenant
```

Send a JSON body to create the first tenant + owner user. The desktop client
wizard will do this for you — see the desktop client README.

## 7. Backups

The volumes that matter are:

- `bookeeper-data` — your library database (`bookeeper.db`) and JWT secret
- `bookeeper-certs` — the trusted_clients.pem trust pool used by Caddy

Set up Hyper Backup to snapshot `/volume1/@docker/volumes/bookeeper-*`
to your preferred destination (USB drive, C2, off-site SMB...).

## 8. Updates

```bash
ssh admin@<nas>
cd /volume1/docker/bookeeper
sudo docker compose pull
sudo docker compose up -d
```

Or use **Watchtower** if you prefer hands-off updates.
