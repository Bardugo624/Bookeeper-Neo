# Bookeeper Neo — Raspberry Pi 5 setup (Tailscale VPN)

End-to-end recipe to run the Bookeeper server on a Raspberry Pi 5 (or any
arm64/amd64 Linux box) reachable from anywhere via Tailscale.

## 0. Prerequisites

- Raspberry Pi 5 (8 GB recommended), NVMe SSD (recommended over microSD),
  official 27 W PSU.
- A Tailscale account (free for up to 100 devices, 3 users).
- A laptop to flash the SD/SSD and SSH into the Pi.

## 1. Flash Raspberry Pi OS (64-bit, Lite)

1. Use the Raspberry Pi Imager.
2. Choose **Raspberry Pi OS Lite (64-bit)**.
3. In the gear menu set: hostname (`bookeeper-pi`), enable SSH (key auth),
   set username `pi` + a strong password, configure Wi-Fi if needed,
   set locale.
4. Flash. Boot the Pi. SSH in.

## 2. Install Docker & Compose

```bash
sudo apt update && sudo apt -y full-upgrade
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
docker compose version
```

## 3. Generate the Tailscale auth key

1. Go to <https://login.tailscale.com/admin/settings/keys>.
2. Click **Generate auth key**.
3. Settings: **Reusable: ON**, **Pre-approved: ON**, **Expiry: 90 days**,
   **Tags: `tag:bookeeper`**.
   - Reusable: the container can re-authenticate after `docker compose down/up`
     without manual intervention.
   - Pre-approved + tag: the new node joins the tailnet without requiring
     someone to click "approve" in the admin UI.
4. Copy the key (`tskey-auth-...`) — you will not see it again.

If you have not yet defined `tag:bookeeper`, edit your tailnet ACLs:

```jsonc
// in https://login.tailscale.com/admin/acls
{
  "tagOwners": {
    "tag:bookeeper": ["autogroup:admin"]
  },
  "acls": [
    // Allow your user devices to reach the Bookeeper server
    { "action": "accept", "src": ["autogroup:member"], "dst": ["tag:bookeeper:8080,8443"] }
  ]
}
```

## 4. Clone the repo & configure

```bash
mkdir -p ~/apps && cd ~/apps
git clone https://github.com/Bardugo624/Bookeeper-Neo.git
cd Bookeeper-Neo/deploy
cp .env.example .env
nano .env
```

Fill in:

- `TS_AUTHKEY` — the key from step 3.
- `SERVER_HOST` — your full tailnet hostname, e.g. `bookeeper.tail1234.ts.net`.
  Find your tailnet name in the admin console under "DNS".
- `TZ` — your timezone (e.g. `Europe/Rome`).

## 5. Start the stack

```bash
docker compose pull
docker compose up -d
docker compose logs -f tailscale
```

Wait until you see `Tailscale up` in the logs. Verify:

```bash
docker compose exec tailscale tailscale status
```

The node `bookeeper` should be listed as online.

## 6. Smoke test from a tailnet peer

From any device on the same tailnet (your laptop, phone with Tailscale app):

```bash
curl -kI https://bookeeper.<tailnet>.ts.net:8080/api/v1/setup/health
# expect HTTP/2 200
```

The bootstrap surface (`:8080`) is plain TLS — used for setup and pairing.
The authenticated surface (`:8443`) requires a client certificate, so a raw
`curl` will fail there: that is the expected behaviour.

## 7. Create the first tenant

```bash
curl -k -X POST https://bookeeper.<tailnet>.ts.net:8080/api/v1/setup/tenant \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_name": "Famiglia Rossi",
    "owner_email": "you@example.com",
    "owner_password": "a-strong-passphrase",
    "owner_display_name": "You"
  }'
```

Save the returned `invite_code` and `ca_fingerprint`.

## 8. Optional: enable offsite backup

1. Pick a backend (Backblaze B2 is cheapest for small data; AWS S3 / any
   S3-compatible works; SFTP to a friend's NAS works).
2. Add to `.env`:
   ```env
   BACKUP_RESTIC_REPOSITORY=b2:my-bucket:/bookeeper
   BACKUP_RESTIC_PASSWORD=<long-random-passphrase-store-in-1password>
   BACKUP_B2_ACCOUNT_ID=<keyID>
   BACKUP_B2_ACCOUNT_KEY=<applicationKey>
   ```
3. Initialise the repository (one-shot):
   ```bash
   docker compose --profile backup run --rm backup restic init
   ```
4. Start the scheduler:
   ```bash
   docker compose --profile backup up -d
   docker compose logs -f backup
   ```
5. Verify nightly snapshot:
   ```bash
   docker compose --profile backup exec backup restic snapshots
   ```

### Restore drill (do this once, document for yourself)

```bash
docker compose --profile backup run --rm \
  -v /tmp/restore:/restore \
  backup restic restore latest --target /restore
ls /tmp/restore/source/data/
```

## 9. Updates

```bash
cd ~/apps/Bookeeper-Neo
git pull
cd deploy
docker compose pull
docker compose up -d
```

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `tailscale` container exits with `tun module not found` | Kernel TUN unavailable | Set `TS_USERSPACE: "true"` in compose |
| Caddy returns `tls: bad certificate` | Trust pool empty (no tenants) | Create the first tenant via setup endpoint |
| Cannot reach `bookeeper.tailnet.ts.net` | MagicDNS off, or peer has no TS client running | Enable MagicDNS in admin → DNS; install Tailscale on client |
| `docker compose up` errors on `TS_AUTHKEY` | `.env` missing or wrong path | Copy `.env.example` → `.env` next to `docker-compose.yml` |
| Backup fails with `Fatal: unable to open repo` | Repo not initialised | `docker compose --profile backup run --rm backup restic init` |

## 11. Hardening checklist

- [ ] Disable password SSH on the Pi (`PasswordAuthentication no`).
- [ ] `ufw` firewall: allow only SSH from LAN.
- [ ] Enable unattended security upgrades (`apt install unattended-upgrades`).
- [ ] Rotate `TS_AUTHKEY` every 90 days (follow this doc again from step 3).
- [ ] Store `BACKUP_RESTIC_PASSWORD` in a password manager — losing it
      means losing all backups.
- [ ] Do a quarterly restore drill.
