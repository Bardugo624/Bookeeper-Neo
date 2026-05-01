# Deploy automation — Bookeeper Neo

Due modi per deployare il server. **La logica è identica**: rsync `server/` +
`deploy/` su `/opt/bookeeper-neo`, rebuild dell'immagine `bookeeper-neo-server:local`,
restart del container, healthcheck.

## 1) Deploy manuale dalla mia macchina (CLI interattiva)

```powershell
.\deploy\scripts\deploy.ps1
```

Menu con 8 azioni: push & deploy, push only, deploy only, rebuild, status,
logs live, trigger workflow GH, setup git clone remoto.

Esecuzione diretta (no menu):

```powershell
.\deploy\scripts\deploy.ps1 -Action push-deploy
.\deploy\scripts\deploy.ps1 -Action logs
```

Override target:

```powershell
$env:BK_REMOTE_HOST = '10.0.0.42'
$env:BK_SSH_KEY     = 'C:\Users\me\.ssh\id_bookeeper'
.\deploy\scripts\deploy.ps1 -Action deploy
```

Requisiti locali: `git`, OpenSSH client (`ssh`), `rsync` (Git for Windows lo
include in `C:\Program Files\Git\usr\bin`).

## 2) Deploy automatico via GitHub Actions

Il workflow `.github/workflows/deploy-server.yml` deploya automaticamente
ogni push su `main` che tocca `server/**` o `deploy/**`. Manualmente:

```powershell
gh workflow run deploy-server.yml
gh run watch
```

### Secrets richiesti (Settings → Secrets and variables → Actions)

| Secret                   | Contenuto                                                    |
|--------------------------|--------------------------------------------------------------|
| `DEPLOY_SSH_KEY`         | chiave privata ED25519 (PEM) — **dedicata al deploy**        |
| `DEPLOY_HOST`            | `46.224.218.228`                                             |
| `DEPLOY_USER`            | `root`                                                       |
| `DEPLOY_KNOWN_HOSTS`     | output di `ssh-keyscan -t ed25519 46.224.218.228` (1 riga)  |

### Bootstrap secrets (one-time, dalla mia macchina)

```powershell
# 1) Genera una chiave dedicata (non riusare la chiave personale)
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\bookeeper_deploy" -N '""' -C 'github-actions-deploy'

# 2) Autorizza la chiave sul server
$pub = Get-Content "$env:USERPROFILE\.ssh\bookeeper_deploy.pub"
ssh root@46.224.218.228 "echo '$pub' >> /root/.ssh/authorized_keys"

# 3) Carica i secrets su GitHub (richiede gh CLI loggato)
gh secret set DEPLOY_SSH_KEY      < "$env:USERPROFILE\.ssh\bookeeper_deploy"
gh secret set DEPLOY_HOST         --body "46.224.218.228"
gh secret set DEPLOY_USER         --body "root"
ssh-keyscan -t ed25519 46.224.218.228 2>$null | gh secret set DEPLOY_KNOWN_HOSTS
```

### Sicurezza

- Chiave dedicata al deploy (non la stessa di uso personale): se compromessa
  basta rimuoverla da `authorized_keys` senza impatto su altri accessi.
- `StrictHostKeyChecking yes` + `known_hosts` pinned dal secret —
  protegge da MITM.
- `concurrency: deploy-server` — un deploy alla volta, no race.
- Step finale `shred` rimuove la chiave dal runner GitHub.
- Workflow ristretto a `paths: server/** deploy/**` — nessun trigger su
  push frontend/docs.

### Limitazione attuale

Il remoto `/opt/bookeeper-neo` non è un git clone, quindi entrambi i metodi
sopra usano `rsync` (non `git pull`). Per riabilitare lo script idempotente
`deploy/scripts/update.sh` (che fa `git pull` + rebuild), eseguire una sola
volta:

```powershell
.\deploy\scripts\deploy.ps1 -Action setup-remote
```

Da quel momento in poi `bash /opt/bookeeper-neo/deploy/scripts/update.sh` sul
server farà `git pull origin main` + rebuild.
