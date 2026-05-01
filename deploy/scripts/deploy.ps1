<#
.SYNOPSIS
    Bookeeper Neo -- deploy CLI per la macchina dev.

.DESCRIPTION
    Menu interattivo che racchiude tutte le operazioni comuni di deploy verso
    il server remoto (Hetzner CPX32). La logica core (rsync server/ + deploy/,
    docker compose build+up, healthcheck) è identica a quella eseguita dal
    workflow GitHub Actions `.github/workflows/deploy-server.yml`, così il
    deploy è identico sia locale (manuale) sia automatizzato (push su main).

.PARAMETER Action
    Esegue direttamente un'azione senza mostrare il menu. Valori:
      push, deploy, push-deploy, rebuild, status, logs, gh-trigger, setup-remote

.PARAMETER NonInteractive
    Disabilita ogni prompt interattivo (utile per scripting/CI). Implica:
    salta conferme distruttive, fallisce invece di chiedere.

.EXAMPLE
    ./deploy.ps1
    Apre il menu interattivo.

.EXAMPLE
    ./deploy.ps1 -Action push-deploy
    Commit auto + push + deploy remoto, senza menu.

.NOTES
    Override tramite env var:
      $env:BK_REMOTE_USER  (default: root)
      $env:BK_REMOTE_HOST  (default: 46.224.218.228)
      $env:BK_REMOTE_PATH  (default: /opt/bookeeper-neo)
      $env:BK_SSH_KEY      (default: chiave SSH default; passa percorso a -i)
#>

[CmdletBinding()]
param(
    [ValidateSet('push', 'deploy', 'push-deploy', 'rebuild', 'status', 'logs', 'gh-trigger', 'setup-remote')]
    [string]$Action,

    [switch]$NonInteractive
)

$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ge 7) { $PSStyle.OutputRendering = 'Ansi' }

# ────────────────────────────────────────────────────────────────────────────
# Config (override via env)
# ────────────────────────────────────────────────────────────────────────────
$RemoteUser   = if ($env:BK_REMOTE_USER) { $env:BK_REMOTE_USER } else { 'root' }
$RemoteHost   = if ($env:BK_REMOTE_HOST) { $env:BK_REMOTE_HOST } else { '46.224.218.228' }
$RemotePath   = if ($env:BK_REMOTE_PATH) { $env:BK_REMOTE_PATH } else { '/opt/bookeeper-neo' }
$ProjectName  = 'bookeeper-neo'
$ContainerSrv = 'bookeeper-neo-server'

$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$SshTarget = "${RemoteUser}@${RemoteHost}"
$SshOpts = @()
if ($env:BK_SSH_KEY) { $SshOpts += @('-i', $env:BK_SSH_KEY) }

# ────────────────────────────────────────────────────────────────────────────
# UI helpers (rendering coerente con SKILL design -- niente emoji, gerarchia
# tipografica chiara via spacing + colore tematico)
# ────────────────────────────────────────────────────────────────────────────
function Write-Section([string]$Title) {
    $line = '-' * ([Math]::Min(60, $Title.Length + 4))
    Write-Host ''
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "  $line"  -ForegroundColor DarkCyan
}
function Write-Step([string]$Msg)  { Write-Host "  > $Msg" -ForegroundColor Blue }
function Write-Ok([string]$Msg)    { Write-Host "  + $Msg" -ForegroundColor Green }
function Write-Warn2([string]$Msg) { Write-Host "  ! $Msg" -ForegroundColor Yellow }
function Write-Err2([string]$Msg)  { Write-Host "  x $Msg" -ForegroundColor Red }

function Invoke-Tool {
    param([string]$Exe, [string[]]$ArgList, [switch]$AllowNonZero)
    & $Exe @ArgList
    if (-not $AllowNonZero -and $LASTEXITCODE -ne 0) {
        throw "$Exe exited with code $LASTEXITCODE"
    }
}

function Invoke-Ssh([string]$RemoteCmd, [switch]$AllowNonZero) {
    $sshArgs = @() + $SshOpts + @($SshTarget, $RemoteCmd)
    Invoke-Tool -Exe 'ssh' -ArgList $sshArgs -AllowNonZero:$AllowNonZero
}

# ────────────────────────────────────────────────────────────────────────────
# Pre-flight
# ────────────────────────────────────────────────────────────────────────────
function Test-Prereqs {
    foreach ($cmd in @('git', 'ssh', 'rsync')) {
        if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
            throw "Comando richiesto non trovato: $cmd. Installa OpenSSH client + rsync (es. via Git for Windows o WSL)."
        }
    }
}

# ────────────────────────────────────────────────────────────────────────────
# Azioni
# ────────────────────────────────────────────────────────────────────────────

function Invoke-Push {
    Write-Section 'Commit & push su origin/main'
    Push-Location $RepoRoot
    try {
        $status = git status --porcelain
        if ($status) {
            Write-Step 'Modifiche locali rilevate:'
            $status | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

            $msg = $null
            if (-not $NonInteractive) {
                $msg = Read-Host "`n  Messaggio commit (vuoto = 'chore: deploy')"
            }
            if ([string]::IsNullOrWhiteSpace($msg)) { $msg = 'chore: deploy' }

            Invoke-Tool 'git' @('add', '-A')
            Invoke-Tool 'git' @('commit', '-m', $msg)
            Write-Ok 'Commit creato'
        } else {
            Write-Step 'Working tree pulito — niente da committare'
        }

        Write-Step 'git push origin main'
        Invoke-Tool 'git' @('push', 'origin', 'main') -AllowNonZero
        # git push scrive su stderr anche in caso di successo → non fail su exit≠0
        Write-Ok 'Push completato'
    } finally {
        Pop-Location
    }
}

function Invoke-RemoteDeploy {
    Write-Section "Deploy remoto su $SshTarget"

    Write-Step 'rsync server/ → remote'
    if ($env:BK_SSH_KEY) {
        Invoke-Tool 'rsync' @('-az', '--delete',
            '--exclude=*.db', '--exclude=*.db-*', '--exclude=data/',
            '-e', "ssh -i $($env:BK_SSH_KEY)",
            "$RepoRoot/server/", "${SshTarget}:${RemotePath}/server/")
    } else {
        Invoke-Tool 'rsync' @('-az', '--delete',
            '--exclude=*.db', '--exclude=*.db-*', '--exclude=data/',
            "$RepoRoot/server/", "${SshTarget}:${RemotePath}/server/")
    }
    Write-Ok 'server/ sincronizzato'

    Write-Step 'rsync deploy/ → remote (preserve .env)'
    if ($env:BK_SSH_KEY) {
        Invoke-Tool 'rsync' @('-az',
            '--exclude=.env', '--exclude=*.local',
            '-e', "ssh -i $($env:BK_SSH_KEY)",
            "$RepoRoot/deploy/", "${SshTarget}:${RemotePath}/deploy/")
    } else {
        Invoke-Tool 'rsync' @('-az',
            '--exclude=.env', '--exclude=*.local',
            "$RepoRoot/deploy/", "${SshTarget}:${RemotePath}/deploy/")
    }
    Write-Ok 'deploy/ sincronizzato'

    Write-Step 'docker compose build --pull bookeeper-server'
    Invoke-Ssh @"
set -e
chmod +x $RemotePath/deploy/scripts/*.sh 2>/dev/null || true
cd $RemotePath/deploy
docker compose --project-name $ProjectName build --pull bookeeper-server 2>&1 | tail -8
"@
    Write-Ok 'Immagine ricostruita'

    Write-Step 'docker compose up -d bookeeper-server'
    Invoke-Ssh "cd $RemotePath/deploy && docker compose --project-name $ProjectName up -d bookeeper-server 2>&1 | tail -5"
    Write-Ok 'Container ricreato'

    Write-Step 'Health check (attesa 4s + log)'
    Invoke-Ssh @"
sleep 4
echo '--- Container state ---'
docker inspect -f '{{.State.Status}} (started {{.State.StartedAt}})' $ContainerSrv
echo '--- Last 20 log lines ---'
docker logs --tail 20 $ContainerSrv 2>&1
"@
    Write-Ok 'Deploy completato'
}

function Invoke-Rebuild {
    Write-Section 'Rebuild + restart container (nessun rsync)'
    Invoke-Ssh @"
set -e
cd $RemotePath/deploy
docker compose --project-name $ProjectName build --pull bookeeper-server 2>&1 | tail -8
docker compose --project-name $ProjectName up -d bookeeper-server 2>&1 | tail -5
sleep 3
docker logs --tail 15 $ContainerSrv 2>&1
"@
    Write-Ok 'Rebuild completato'
}

function Invoke-Status {
    Write-Section "Stato stack — $SshTarget"
    Invoke-Ssh @"
echo '--- compose ps ---'
cd $RemotePath/deploy && docker compose --project-name $ProjectName ps
echo
echo '--- disk usage (data volume) ---'
docker system df -v 2>/dev/null | grep -E '($ProjectName|VOLUME NAME)' || true
echo
echo '--- last commit deployed (server/) ---'
ls -la $RemotePath/server/internal/db/migrations/ | tail -5
"@
}

function Invoke-Logs {
    Write-Section 'Log live (Ctrl+C per uscire)'
    Invoke-Ssh "docker logs -f --tail 50 $ContainerSrv" -AllowNonZero
}

function Invoke-GhTrigger {
    Write-Section 'Trigger workflow GitHub Actions (deploy-server.yml)'
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Err2 "GitHub CLI 'gh' non installata. https://cli.github.com/"
        return
    }
    Push-Location $RepoRoot
    try {
        Invoke-Tool 'gh' @('workflow', 'run', 'deploy-server.yml', '--ref', 'main')
        Write-Ok 'Workflow avviato — vedi: gh run watch'
        Write-Step 'Apertura browser sulla run...'
        Invoke-Tool 'gh' @('run', 'list', '--workflow=deploy-server.yml', '--limit=1') -AllowNonZero
    } finally {
        Pop-Location
    }
}

function Invoke-SetupRemote {
    Write-Section 'Setup remoto: converti /opt/bookeeper-neo in git clone'
    Write-Warn2 "Questa operazione INIZIALIZZA un git clone in $RemotePath"
    Write-Warn2 'preservando .env e i volumi Docker. Eseguire una sola volta.'
    if (-not $NonInteractive) {
        $ok = Read-Host "  Procedere? [y/N]"
        if ($ok -ne 'y' -and $ok -ne 'Y') { Write-Step 'Annullato'; return }
    }
    $repoUrl = (git -C $RepoRoot remote get-url origin).Trim()
    Invoke-Ssh @"
set -e
cd $RemotePath
if [ -d .git ]; then
    echo 'Repo già inizializzato — skip clone, eseguo pull'
    git fetch --quiet origin main
    git reset --hard origin/main
else
    cp deploy/.env /tmp/bk-env-backup
    git init -q
    git remote add origin $repoUrl
    git fetch --quiet origin main
    # Forza checkout main sovrascrivendo file locali (tranne .env già copiato)
    git reset --hard origin/main
    cp /tmp/bk-env-backup deploy/.env
    rm /tmp/bk-env-backup
    echo 'Clone inizializzato e .env ripristinato'
fi
chmod +x deploy/scripts/*.sh
"@
    Write-Ok 'Remote ora è un git clone — update.sh ora funziona end-to-end'
}

# ────────────────────────────────────────────────────────────────────────────
# Menu
# ────────────────────────────────────────────────────────────────────────────
function Show-Menu {
    Clear-Host
    Write-Host ''
    Write-Host '  +----------------------------------------------------------+' -ForegroundColor DarkCyan
    Write-Host '  |           BOOKEEPER NEO -- Deploy CLI                    |' -ForegroundColor Cyan
    Write-Host '  +----------------------------------------------------------+' -ForegroundColor DarkCyan
    Write-Host "    Target: $SshTarget : $RemotePath" -ForegroundColor DarkGray
    Write-Host "    Branch: $(git -C $RepoRoot rev-parse --abbrev-ref HEAD) @ $(git -C $RepoRoot rev-parse --short HEAD)" -ForegroundColor DarkGray
    Write-Host ''
    Write-Host '    1) Push & deploy        (commit + push + rsync + rebuild + restart)' -ForegroundColor White
    Write-Host '    2) Push only            (git add -A, commit, push)'                  -ForegroundColor White
    Write-Host '    3) Deploy current       (rsync + rebuild + restart, no git)'         -ForegroundColor White
    Write-Host '    4) Rebuild only         (docker build + up, nessun rsync)'           -ForegroundColor White
    Write-Host '    5) Stack status         (compose ps + disk)'                         -ForegroundColor White
    Write-Host '    6) Tail logs            (live, Ctrl+C per uscire)'                   -ForegroundColor White
    Write-Host '    7) Trigger GH Actions   (workflow_dispatch via gh CLI)'              -ForegroundColor White
    Write-Host '    8) Setup remote git     (one-time: converte /opt in clone)'          -ForegroundColor White
    Write-Host ''
    Write-Host '    0) Esci' -ForegroundColor DarkGray
    Write-Host ''
    return Read-Host '  Scelta'
}

function Invoke-Action([string]$A) {
    switch ($A) {
        'push'         { Invoke-Push }
        'deploy'       { Invoke-RemoteDeploy }
        'push-deploy'  { Invoke-Push; Invoke-RemoteDeploy }
        'rebuild'      { Invoke-Rebuild }
        'status'       { Invoke-Status }
        'logs'         { Invoke-Logs }
        'gh-trigger'   { Invoke-GhTrigger }
        'setup-remote' { Invoke-SetupRemote }
        default        { throw "Azione sconosciuta: $A" }
    }
}

# ────────────────────────────────────────────────────────────────────────────
# Main
# ────────────────────────────────────────────────────────────────────────────
Test-Prereqs

if ($Action) {
    Invoke-Action $Action
    exit 0
}

while ($true) {
    $choice = Show-Menu
    try {
        switch ($choice) {
            '1' { Invoke-Action 'push-deploy' }
            '2' { Invoke-Action 'push' }
            '3' { Invoke-Action 'deploy' }
            '4' { Invoke-Action 'rebuild' }
            '5' { Invoke-Action 'status' }
            '6' { Invoke-Action 'logs' }
            '7' { Invoke-Action 'gh-trigger' }
            '8' { Invoke-Action 'setup-remote' }
            '0' { Write-Host ''; Write-Host '  Ciao.' -ForegroundColor DarkGray; exit 0 }
            default { Write-Warn2 "Scelta non valida: '$choice'" }
        }
    } catch {
        Write-Err2 $_.Exception.Message
    }
    Write-Host ''
    Read-Host '  [Invio per tornare al menu]' | Out-Null
}
