# Bookeeper Neo — Windows Docker Desktop setup

> The server is meant to run on a machine that's always on (a NAS or a home
> PC that you leave booted). On Windows we use **Docker Desktop** with the
> *Start Docker Desktop when you log in* option enabled.

## 1. Install Docker Desktop

1. Download from <https://www.docker.com/products/docker-desktop/>
2. Install with the WSL 2 backend (default, recommended).
3. After install: **Settings → General → Start Docker Desktop when you log in** ✔
4. **Settings → Resources → File sharing**: ensure the drive that hosts the
   project (e.g. `C:`) is shared.

## 2. Project layout

Pick a stable folder, e.g. `C:\bookeeper\`.

```
C:\bookeeper\
  docker-compose.yml      ← copy from deploy/
  Caddyfile               ← copy from deploy/
  .env                    ← see below
```

`.env`:

```env
SERVICE_NAME=Bookeeper
SERVER_HOST=bookeeper.local
```

## 3. Start the stack

```powershell
cd C:\bookeeper
docker compose pull
docker compose up -d
```

Verify:

```powershell
docker compose ps
docker compose logs -f bookeeper-server
```

## 4. Auto-start on Windows login

`restart: unless-stopped` in the compose file means the containers restart
themselves once Docker Desktop is up. The remaining piece is making sure
Docker Desktop *itself* is up: that's the **Start at login** option in
step 1.

If your PC user does not auto-login, use Task Scheduler:

1. **Task Scheduler → Create Task...**
2. **Triggers → New → At startup**
3. **Actions → Start a program**: `"C:\Program Files\Docker\Docker\Docker Desktop.exe"`
4. **General → Run whether user is logged on or not** ✔

## 5. First-time setup

```powershell
curl.exe -k https://localhost:8080/healthz
```

Should return `{"status":"ok",...}`. Then proceed with the desktop client
onboarding wizard which will call `/setup/tenant` for you.

## 6. Firewall

To let phones on the LAN connect, allow inbound TCP **8443** and **8080**
in Windows Defender Firewall (Public + Private profiles).

## 7. Updates

```powershell
cd C:\bookeeper
docker compose pull
docker compose up -d
```
