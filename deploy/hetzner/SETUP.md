# Bookeeper Neo — Hetzner CPX32 setup (hybrid public + Tailscale)

End-to-end recipe for running the Bookeeper server on a Hetzner Cloud
CPX32 you already host. Public mTLS for daily use from anywhere; Tailscale
gates the bootstrap/pairing surface.

## 0. Assumptions

- You already have a CPX32 (4 vCPU, 8 GB RAM, 160 GB NVMe) at
  `46.224.218.228` running Debian 12 or Ubuntu 24.04.
- You own `albacremisi.org` and can edit DNS records.
- You have a Tailscale account.
- Hetzner Cloud weekly snapshots are enabled on the VM (primary backup).
- **The host already runs other Docker workloads.** Bookeeper Neo is
  configured to coexist with them with zero interaction — see section 1
  for the coexistence audit.

## 0.1 SSH host key (verify on every connect)

The production host's SSH host fingerprint:

```
SHA256:HEdPXR5hUgXbA8nNWNePTtGPMJ9+82RVbvtPz7s859c   root@alba-prod-1
```

When you `ssh root@46.224.218.228` for the first time, OpenSSH shows the
fingerprint and asks to confirm. **Verify it matches the line above
character-for-character before typing `yes`.** If it does not match, do
NOT continue — you may be facing a MITM or the wrong server.

To skip the manual prompt and pin the key in `known_hosts` ahead of time,
on your workstation:

```bash
# Fetch the host key, verify its fingerprint, then add to known_hosts.
HOST=46.224.218.228
EXPECTED='SHA256:HEdPXR5hUgXbA8nNWNePTtGPMJ9+82RVbvtPz7s859c'
ssh-keyscan -t ed25519 "$HOST" 2>/dev/null > /tmp/alba.pub
GOT=$(ssh-keygen -lf /tmp/alba.pub | awk '{print $2}')
[[ "$GOT" == "$EXPECTED" ]] || { echo "FINGERPRINT MISMATCH: $GOT"; exit 1; }
cat /tmp/alba.pub >> ~/.ssh/known_hosts
echo "Pinned $HOST."
```

If the host key ever changes (legitimate rotation, server rebuild from
snapshot, DNS hijack), `ssh` will refuse to connect and ask you to remove
the stale entry — never do that blindly; verify the new fingerprint via
an out-of-band channel first.

## 1. Coexistence audit (run BEFORE anything else)

The Bookeeper stack uses a unique compose project name (`bookeeper-neo`),
a fixed bridge subnet (`172.31.7.0/24`), and binds public ports to a
specific host interface. Verify there is no collision on your host:

```bash
# 1.1 Subnets in use by other Docker networks. None should overlap
# 172.31.7.0/24 (change BOOKEEPER_SUBNET in .env if it does).
docker network ls -q | xargs -I {} docker network inspect {} \
  --format '{{.Name}}\t{{range .IPAM.Config}}{{.Subnet}}{{end}}'

# 1.2 Container names beginning with `bookeeper-neo-` (none expected).
docker ps -a --format '{{.Names}}' | grep ^bookeeper-neo- || echo OK

# 1.3 Volumes beginning with `bookeeper-neo-` (none expected).
docker volume ls --format '{{.Name}}' | grep ^bookeeper-neo- || echo OK

# 1.4 What is currently listening on 80/443 of 0.0.0.0?
ss -lntp 'sport = :80 or sport = :443'
```

If step 1.4 shows another process on 80/443 (very likely — your existing
reverse proxy), pick **one** of these strategies and reflect it in `.env`:

### Strategy A — TCP passthrough from your existing proxy (recommended)

Keep your existing reverse proxy in front. It does NOT terminate TLS for
Bookeeper; it just forwards raw TCP so Caddy can do its own ACME and
mTLS unchanged.

`.env`:
```env
HOST_BIND_IP=127.0.0.1
PUBLIC_HTTPS_PORT=8443
ACME_HTTP_PORT=8080
```

Add to your existing proxy config (Caddy example):
```caddyfile
bookeeper.albacremisi.org {
    reverse_proxy 127.0.0.1:8443 {
        transport http {
            tls
            tls_insecure_skip_verify  # client must verify, not the L4 hop
        }
    }
}
```
For TLS-passthrough you actually want **Layer 4** forwarding (cert and
mTLS handshake reach Bookeeper directly). With Caddy use `layer4` plugin;
with nginx, the `stream` module:
```nginx
stream {
    map $ssl_preread_server_name $bookeeper_backend {
        bookeeper.albacremisi.org 127.0.0.1:8443;
    }
    server {
        listen 443;
        ssl_preread on;
        proxy_pass $bookeeper_backend;
    }
}
```

### Strategy B — Floating IP dedicated to Bookeeper

Attach a Hetzner Floating IP to the VM (panel → Floating IPs). Bind
Bookeeper to that address only, your existing proxy stays on the primary IP.

`.env`:
```env
HOST_BIND_IP=<floating-ip>
PUBLIC_HTTPS_PORT=443
ACME_HTTP_PORT=80
```
DNS A record points to the floating IP, not the primary.

### Strategy C — Non-standard public ports

If you accept that clients connect to `https://bookeeper.albacremisi.org:8443`
in the URL, just expose 8443 publicly and skip your existing proxy.

`.env`:
```env
HOST_BIND_IP=0.0.0.0
PUBLIC_HTTPS_PORT=8443
ACME_HTTP_PORT=8080  # but ACME HTTP-01 ALWAYS uses 80 publicly!
                     # Use Strategy A or DNS-01 instead.
```

## 2. DNS

Create an A record:

```
bookeeper.albacremisi.org.   IN  A  46.224.218.228
```

Wait for propagation (`dig bookeeper.albacremisi.org +short` should return
the IP) before continuing — Caddy needs DNS in place to pass the ACME
HTTP-01 challenge.

## 3. Hetzner Cloud Firewall

Create a firewall (Hetzner panel → Firewalls → New) and attach to the VM.
Adjust the table below to your chosen strategy from section 1.

| Direction | Port  | Source            | Reason                                |
|-----------|-------|-------------------|---------------------------------------|
| Inbound   | 22    | Your home IP only | SSH                                   |
| Inbound   | 80    | 0.0.0.0/0, ::/0   | ACME HTTP-01 (your front proxy or B/C)|
| Inbound   | 443   | 0.0.0.0/0, ::/0   | mTLS API (your front proxy or B)      |
| Inbound   | 41641 | 0.0.0.0/0, ::/0   | Tailscale UDP (NAT traversal)         |

*Strategy A:* the front proxy (already on 80/443) handles inbound; the
Bookeeper ports 8443/8080 are bound to 127.0.0.1 only and need no
firewall rule.

## 4. Install Docker & harden the host (one-shot bootstrap)

The repo ships an idempotent provisioning script that:

- updates the OS and enables unattended security upgrades,
- installs Docker (without disturbing your existing containers),
- installs `fail2ban` for sshd,
- installs your operator pubkey from `deploy/scripts/authorized_keys`
  into `/root/.ssh/authorized_keys`,
- hardens sshd (disables password auth — only after a key is present),
- enables UFW with default-deny inbound, allowing SSH and Tailscale UDP.

Run it once, as root, on the Hetzner VM:

```bash
ssh root@46.224.218.228
mkdir -p /opt && cd /opt
git clone https://github.com/Bardugo624/Bookeeper-Neo.git bookeeper-neo
cd bookeeper-neo
sudo ./deploy/scripts/bootstrap.sh
```

The script is safe to re-run; nothing is reapplied if already in place.
It does **not** touch any pre-existing Docker container, network or
volume on the host.

> If you skip the script, perform the equivalent manually:
> `apt update && apt -y full-upgrade && curl -fsSL https://get.docker.com | sh && docker compose version`.

## 5. Generate the Tailscale auth key

1. <https://login.tailscale.com/admin/settings/keys> → **Generate auth key**.
2. **Reusable: ON**, **Pre-approved: ON**, **Tags: `tag:bookeeper`**,
   **Expiry: 90 days**.
3. Copy `tskey-auth-...`.

If `tag:bookeeper` is new, add it to your tailnet ACL:

```jsonc
{
  "tagOwners": {
    "tag:bookeeper": ["autogroup:admin"]
  },
  "acls": [
    { "action": "accept", "src": ["autogroup:member"], "dst": ["tag:bookeeper:443"] }
  ]
}
```

## 6. Note your tailnet name

Tailscale admin → **DNS** → look at "Tailnet name", e.g. `tail1234.ts.net`.
You will use it as `TAILNET` in the `.env`. The MagicDNS FQDN of the
server becomes `bookeeper.tail1234.ts.net`.

## 7. Clone the repo & configure

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/Bardugo624/Bookeeper-Neo.git
cd Bookeeper-Neo/deploy
cp .env.example .env
nano .env
```

Fill in `TS_AUTHKEY`, `TAILNET`, `SERVER_HOST`, `ACME_EMAIL`, **and the
coexistence vars** from section 1: `HOST_BIND_IP`, `PUBLIC_HTTPS_PORT`,
`ACME_HTTP_PORT`, optionally `BOOKEEPER_SUBNET`.

Then run the pre-flight audit — it verifies that the chosen subnet,
container/volume names, and host ports do not collide with anything
already running on the box:

```bash
sudo ./scripts/preflight.sh
```

Fix any FAIL it reports before continuing.

## 8. Start the stack

```bash
docker compose pull
docker compose up -d
docker compose logs -f
```

You should see, in this order:

1. `tailscale` becomes healthy (`Tailscale up`).
2. `bookeeper-server` listens on `:7842` and `:7843`.
3. `caddy` obtains the Let's Encrypt cert (`certificate obtained successfully`).

## 9. Smoke tests

### 9a. Public mTLS surface

From anywhere on the internet:

```bash
curl -I https://bookeeper.albacremisi.org/
# Expected: HTTP/2 400 — Caddy rejects because no client cert presented.
# That is correct: only paired devices can authenticate.
```

### 9b. Tailscale bootstrap surface

From a machine joined to your tailnet (with the Tailscale client running):

```bash
curl -I https://bookeeper.tail1234.ts.net/api/v1/setup/health
# Expected: HTTP/2 200
```

If you get a connection refused, check `docker compose exec tailscale
tailscale serve status` — should show `https://bookeeper.tail1234.ts.net
→ http://bookeeper-server:7843`.

## 10. Create the first tenant (via the tailnet surface)

```bash
curl -X POST https://bookeeper.tail1234.ts.net/api/v1/setup/tenant \
  -H 'Content-Type: application/json' \
  -d '{
    "tenant_name": "Famiglia Rossi",
    "owner_email": "you@example.com",
    "owner_password": "a-strong-passphrase",
    "owner_display_name": "You"
  }'
```

Save the returned `invite_code` and `ca_fingerprint`. Subsequent device
pairings (desktop bootstrap, mobile QR) also go through the tailnet
surface.

After the first tenant is created, the Caddy trust pool is auto-populated
and the public mTLS surface starts accepting client certs issued by that
tenant's CA.

## 11. Backups

### 11a. Hetzner snapshots (primary, already on)

Hetzner panel → Server → Snapshots → ensure "Automatic backups" is
enabled (≈20% surcharge on VM cost). Hetzner keeps 7 daily backups
rotated automatically. To restore, just create a new server from the
snapshot — entire stack, sqlite, certs, tailscale state included.

### 11b. Optional off-Hetzner copy (restic)

Useful if you want a second copy on a different provider for disaster
recovery (Hetzner-wide outage, account loss, etc.). Pick any S3-compatible
target.

```bash
# Edit .env: BACKUP_RESTIC_REPOSITORY, BACKUP_RESTIC_PASSWORD, backend creds.
docker compose --profile backup run --rm backup restic init
docker compose --profile backup up -d
docker compose --profile backup logs -f backup
```

## 12. Updates

The repo ships an idempotent updater that pulls the latest commits,
re-pulls only the images for the `bookeeper-neo` compose project, and
prunes only its own dangling images (other Docker stacks on the host are
untouched). It also waits and verifies that all services came back
healthy.

```bash
sudo /opt/bookeeper-neo/deploy/scripts/update.sh
```

Optionally schedule it weekly via cron (Sundays at 04:00):

```bash
( crontab -l 2>/dev/null; echo '0 4 * * 0 /opt/bookeeper-neo/deploy/scripts/update.sh >> /var/log/bookeeper-update.log 2>&1' ) | crontab -
```

The OS itself is updated automatically by `unattended-upgrades` (set up
by `bootstrap.sh` in section 4).

## 13. Troubleshooting

| Symptom                                       | Likely cause                                   | Fix                                                         |
|-----------------------------------------------|------------------------------------------------|-------------------------------------------------------------|
| `caddy` fails ACME with `unauthorized`        | DNS not propagated yet                         | Wait, `dig` to verify, then `docker compose restart caddy`  |
| `caddy` ACME with `connection refused :80`    | Front proxy not passing through, or FW closed  | Verify Strategy A passthrough or open port 80               |
| `port is already allocated`                   | Another container/service holds the host port  | Re-run section 1 audit, change PUBLIC_HTTPS_PORT/HOST_BIND_IP|
| `Pool overlaps with other one on this address` | BOOKEEPER_SUBNET collides with existing network| Pick a free /24 (run `docker network inspect` to find one)  |
| `tailscale serve status` empty                | `TAILNET` mismatch in .env                     | Match exactly the value from Tailscale admin → DNS          |
| `tailscale` exits with `tun module not found` | Kernel TUN unavailable                         | Set `TS_USERSPACE: "true"` in compose                       |
| Public 443 returns `tls: bad certificate`     | Trust pool empty (no tenants)                  | Create the first tenant via the tailnet surface             |
| Mobile QR pairing times out                   | Mobile not on tailnet                          | Install Tailscale on mobile, sign in, retry                 |

## 14. Hardening checklist

- [ ] SSH: disable password auth (`PasswordAuthentication no`), root login
      via key only.
- [ ] `unattended-upgrades` for automatic OS security patches.
- [ ] Hetzner snapshots: verify they're being created weekly.
- [ ] Quarterly restore drill: spin up a CPX11 from latest snapshot,
      verify the stack boots and `setup/health` responds.
- [ ] Rotate `TS_AUTHKEY` every 90 days (its expiry).
- [ ] Monitor Caddy cert renewal (`docker compose logs caddy | grep -i acme`)
      30 days before expiry.
- [ ] Consider Hetzner Cloud alerts on high CPU / disk / outbound traffic.
