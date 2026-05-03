<#
.SYNOPSIS
    Bookeeper Neo -- publish desktop client (build + upload + manifest).

.DESCRIPTION
    Pipeline end-to-end per pubblicare una nuova versione del client
    desktop sul bucket R2 Cloudflare. Esegue:

      1. Bump versione (wails.json + frontend/package.json) se richiesto
      2. Estrae le note dal CHANGELOG.md (sezione [X.Y.Z])
      3. Build NSIS via wails con -ldflags per iniettare versione/data
      4. Calcola SHA-256 dell'installer
      5. Genera latest.json (manifest auto-updater)
      6. Carica installer + manifest su R2 (s3-compatible)

    L'updater dell'app interroga `desktop/<channel>/latest.json` e
    confronta con la versione locale.

.PARAMETER Version
    Versione esplicita "X.Y.Z" (sovrascrive wails.json). Esclusivo con -Bump.

.PARAMETER Bump
    Incremento semver: patch | minor | major. Esclusivo con -Version.

.PARAMETER Channel
    Canale di rilascio. Default: stable. Le release "beta" vanno in
    `desktop/beta/latest.json` e gli utenti devono optare in via UI
    (non implementato in v0.1).

.PARAMETER DryRun
    Esegue tutto tranne il caricamento su R2. Utile per testare il flusso.

.PARAMETER SkipBuild
    Salta lo step di build (riusa l'ultimo .exe in build/bin). Utile
    per ri-pubblicare un manifest dopo un fix dello script.

.PARAMETER NoBumpFrontend
    Non aggiornare frontend/package.json (es. se versionato a parte).

.NOTES
    Variabili d'ambiente richieste (per upload):
      R2_ACCESS_KEY_ID       Access key ID del bucket
      R2_SECRET_ACCESS_KEY   Secret key
      R2_ENDPOINT            es. https://<account>.r2.cloudflarestorage.com
      R2_BUCKET              Nome bucket (default: bookeeper-releases)
      R2_PUBLIC_BASE         URL pubblico base (default: https://pub-<id>.r2.dev)

    Dipende da `aws` CLI configurabile via --endpoint-url (S3-compatible).

.EXAMPLE
    ./publish-desktop.ps1 -Bump patch
    ./publish-desktop.ps1 -Version 0.2.0 -Channel stable
    ./publish-desktop.ps1 -Version 0.2.0 -DryRun
#>

[CmdletBinding(DefaultParameterSetName = 'Bump')]
param(
    [Parameter(ParameterSetName = 'Explicit', Mandatory = $true)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Version,

    [Parameter(ParameterSetName = 'Bump')]
    [ValidateSet('patch', 'minor', 'major', 'none')]
    [string]$Bump = 'none',

    [ValidateSet('stable', 'beta')]
    [string]$Channel = 'stable',

    [switch]$DryRun,
    [switch]$SkipBuild,
    [switch]$NoBumpFrontend
)

$ErrorActionPreference = 'Stop'

# ────────────────────────────────────────────────────────────────────────────
# Logging helpers (allineati a deploy.ps1)
# ────────────────────────────────────────────────────────────────────────────
function Write-Section([string]$Title) {
    $line = ('=' * 70)
    Write-Host ""
    Write-Host "  $Title" -ForegroundColor Cyan
    Write-Host "  $line"  -ForegroundColor DarkCyan
}
function Write-Step([string]$Msg) { Write-Host "  > $Msg" -ForegroundColor Blue }
function Write-Ok  ([string]$Msg) { Write-Host "  + $Msg" -ForegroundColor Green }
function Write-Warn2([string]$Msg) { Write-Host "  ! $Msg" -ForegroundColor Yellow }
function Write-Err2 ([string]$Msg) { Write-Host "  x $Msg" -ForegroundColor Red }

# ────────────────────────────────────────────────────────────────────────────
# Path & config
# ────────────────────────────────────────────────────────────────────────────
$RepoRoot     = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$DesktopDir   = Join-Path $RepoRoot 'clients\desktop'
$WailsJson    = Join-Path $DesktopDir 'wails.json'
$PkgJson      = Join-Path $DesktopDir 'frontend\package.json'
$BuildBinDir  = Join-Path $DesktopDir 'build\bin'
$ChangelogPath = Join-Path $RepoRoot 'CHANGELOG.md'

$Bucket      = if ($env:R2_BUCKET)      { $env:R2_BUCKET }      else { 'bookeeper-releases' }
$PublicBase  = if ($env:R2_PUBLIC_BASE) { $env:R2_PUBLIC_BASE } else { 'https://pub-0df1da0d1687437385f2c20390176493.r2.dev' }

# ────────────────────────────────────────────────────────────────────────────
# Auto-load deploy/.env.publish (gitignored). Permette di lanciare lo script
# senza esportare manualmente le R2 credentials nella sessione PowerShell.
# Il file e' la source-of-truth: i valori in .env.publish SOVRASCRIVONO le
# env var gia' presenti nel processo (evita sorprese da var dimenticate).
# ────────────────────────────────────────────────────────────────────────────
$EnvPublish = Join-Path $RepoRoot 'deploy\.env.publish'
if (Test-Path $EnvPublish) {
    Get-Content $EnvPublish | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $eq = $line.IndexOf('=')
        if ($eq -lt 1) { return }
        $name = $line.Substring(0, $eq).Trim()
        $val  = $line.Substring($eq + 1).Trim().Trim('"').Trim("'")
        Set-Item -Path "Env:$name" -Value $val
    }
    # Ricalcola defaults eventualmente popolati da .env.publish
    if ($env:R2_BUCKET)      { $Bucket = $env:R2_BUCKET }
    if ($env:R2_PUBLIC_BASE) { $PublicBase = $env:R2_PUBLIC_BASE }
}

# ────────────────────────────────────────────────────────────────────────────
# 0) Sanity check
# ────────────────────────────────────────────────────────────────────────────
Write-Section 'Pre-flight'

if (-not (Test-Path $WailsJson))   { Write-Err2 "wails.json non trovato: $WailsJson"; exit 1 }
if (-not (Test-Path $ChangelogPath)) { Write-Err2 "CHANGELOG.md mancante in: $ChangelogPath"; exit 1 }

if (-not $DryRun) {
    foreach ($v in 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_ENDPOINT') {
        if (-not (Get-Item "Env:$v" -ErrorAction SilentlyContinue)) {
            Write-Err2 "Manca variabile d'ambiente: $v (necessaria per upload). Usa -DryRun per saltare."
            exit 1
        }
    }
    if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
        Write-Err2 "AWS CLI non trovato nel PATH. Installa: https://aws.amazon.com/cli/"
        exit 1
    }
}
Write-Ok "Repo root: $RepoRoot"
Write-Ok "Channel  : $Channel"
Write-Ok "R2 bucket: $Bucket"
Write-Ok "R2 base  : $PublicBase"
if ($DryRun) { Write-Warn2 "DRY-RUN attivo: nessun upload verra' eseguito." }

# ────────────────────────────────────────────────────────────────────────────
# 1) Determina versione finale
# ────────────────────────────────────────────────────────────────────────────
Write-Section 'Versioning'

$wails = Get-Content $WailsJson -Raw | ConvertFrom-Json
$currentVersion = $wails.info.productVersion
if (-not $currentVersion) {
    Write-Err2 "wails.json: info.productVersion non definito. Configura il blocco info."
    exit 1
}
Write-Step "Versione corrente: $currentVersion"

if ($PSCmdlet.ParameterSetName -eq 'Explicit') {
    $newVersion = $Version
} elseif ($Bump -ne 'none') {
    $parts = $currentVersion -split '\.'
    [int]$mj = $parts[0]; [int]$mn = $parts[1]; [int]$pt = $parts[2]
    switch ($Bump) {
        'major' { $mj++; $mn = 0; $pt = 0 }
        'minor' { $mn++; $pt = 0 }
        'patch' { $pt++ }
    }
    $newVersion = "$mj.$mn.$pt"
} else {
    $newVersion = $currentVersion
    Write-Warn2 "Nessun -Version o -Bump: ripubblico la versione attuale ($newVersion)."
}

Write-Ok "Versione target  : $newVersion"

if ($newVersion -ne $currentVersion) {
    # Aggiorna wails.json (preserva indentazione 2 spazi).
    # NB: usiamo WriteAllText con UTF8Encoding($false) per evitare il BOM
    # che Set-Content -Encoding UTF8 scrive in PowerShell 5.1 — il parser
    # JSON di Wails (Go) rifiuta il BOM con "invalid character 'ï'".
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    $wails.info.productVersion = $newVersion
    [System.IO.File]::WriteAllText($WailsJson, ($wails | ConvertTo-Json -Depth 20), $utf8NoBom)
    Write-Ok "wails.json aggiornato a $newVersion"

    if (-not $NoBumpFrontend -and (Test-Path $PkgJson)) {
        $pkg = Get-Content $PkgJson -Raw | ConvertFrom-Json
        $pkg.version = $newVersion
        [System.IO.File]::WriteAllText($PkgJson, ($pkg | ConvertTo-Json -Depth 20), $utf8NoBom)
        Write-Ok "frontend/package.json aggiornato a $newVersion"
    }
}

# ────────────────────────────────────────────────────────────────────────────
# 2) Estrai changelog per questa versione
# ────────────────────────────────────────────────────────────────────────────
Write-Section 'Changelog'

$clText = Get-Content $ChangelogPath -Raw
# Match `## [X.Y.Z]` o `## [X.Y.Z] - YYYY-MM-DD` fino al prossimo `## [`
$pattern = "## \[$([regex]::Escape($newVersion))\][^\r\n]*\r?\n(.*?)(?=\r?\n## \[|\z)"
$m = [regex]::Match($clText, $pattern, 'Singleline')
if (-not $m.Success) {
    Write-Err2 "Sezione [$newVersion] non trovata in CHANGELOG.md."
    Write-Err2 "Aggiungi una sezione '## [$newVersion] - $(Get-Date -Format 'yyyy-MM-dd')' prima di pubblicare."
    exit 1
}
$notesMd = $m.Groups[1].Value.Trim()
Write-Ok "Note estratte ($($notesMd.Length) caratteri)"

# ────────────────────────────────────────────────────────────────────────────
# 3) Build wails (NSIS) con ldflags per versionare il binario
# ────────────────────────────────────────────────────────────────────────────
Write-Section 'Build'

$buildDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$ldflags   = "-X desktop/internal/version.Version=$newVersion " +
             "-X desktop/internal/version.BuildDate=$buildDate " +
             "-X desktop/internal/version.Channel=$Channel"

$installerPath = Join-Path $BuildBinDir "desktop-amd64-installer.exe"

if ($SkipBuild) {
    Write-Warn2 "SkipBuild attivo: salto build, riuso $installerPath"
} else {
    Push-Location $DesktopDir
    try {
        Write-Step "wails build --platform windows/amd64 --nsis"
        & wails build --platform windows/amd64 --nsis -ldflags "$ldflags"
        if ($LASTEXITCODE -ne 0) { throw "wails build fallita (exit $LASTEXITCODE)" }
    } finally { Pop-Location }
}

if (-not (Test-Path $installerPath)) {
    Write-Err2 "Installer non trovato: $installerPath"
    exit 1
}
$installerSize = (Get-Item $installerPath).Length
Write-Ok "Installer: $installerPath ($([math]::Round($installerSize/1MB,2)) MB)"

# ────────────────────────────────────────────────────────────────────────────
# 4) SHA-256
# ────────────────────────────────────────────────────────────────────────────
Write-Section 'Hash'

$hash = (Get-FileHash -Algorithm SHA256 -Path $installerPath).Hash.ToLower()
Write-Ok "SHA-256: $hash"

# ────────────────────────────────────────────────────────────────────────────
# 5) Genera manifest
# ────────────────────────────────────────────────────────────────────────────
Write-Section 'Manifest'

$installerKey  = "desktop/$Channel/Bookeeper-$newVersion-amd64-installer.exe"
$manifestKey   = "desktop/$Channel/latest.json"
$installerUrl  = "$PublicBase/$installerKey"

$manifest = [ordered]@{
    version       = $newVersion
    release_date  = $buildDate
    installer_url = $installerUrl
    sha256        = $hash
    size_bytes    = $installerSize
    notes_md      = $notesMd
    min_version   = '0.1.0'
    channel       = $Channel
}
$manifestPath = Join-Path $BuildBinDir 'latest.json'
$utf8NoBomManifest = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 5), $utf8NoBomManifest)
Write-Ok "Manifest: $manifestPath"
Write-Host ($manifest | ConvertTo-Json -Depth 5) -ForegroundColor DarkGray

# ────────────────────────────────────────────────────────────────────────────
# 6) Upload R2 (S3-compatible)
# ────────────────────────────────────────────────────────────────────────────
Write-Section 'Upload R2'

if ($DryRun) {
    Write-Warn2 "DRY-RUN: salto upload."
    Write-Ok "Avresti caricato:"
    Write-Host "    s3://$Bucket/$installerKey  ($installerSize bytes)" -ForegroundColor DarkGray
    Write-Host "    s3://$Bucket/$manifestKey"                          -ForegroundColor DarkGray
    return
}

# Configura credenziali per il processo corrente
$env:AWS_ACCESS_KEY_ID     = $env:R2_ACCESS_KEY_ID
$env:AWS_SECRET_ACCESS_KEY = $env:R2_SECRET_ACCESS_KEY
$env:AWS_DEFAULT_REGION    = 'auto'   # R2 ignora la region ma AWS CLI la richiede

$awsCommon = @('--endpoint-url', $env:R2_ENDPOINT)

Write-Step "Upload installer -> s3://$Bucket/$installerKey"
# NB: NIENTE 'immutable' nel cache-control. L'installer ha il numero
# di versione nel filename, quindi in teoria immutable sarebbe corretto
# — MA durante il dev cycle ripubblichiamo la stessa versione piu' volte
# e il CDN R2 servirebbe la copia stale per 1 anno, scollegata dal
# manifest aggiornato. Una max-age moderata + must-revalidate evita
# sorprese e costa meno di 1 HEAD request per update.
& aws s3 cp $installerPath "s3://$Bucket/$installerKey" `
    --content-type 'application/vnd.microsoft.portable-executable' `
    --cache-control 'public, max-age=300, must-revalidate' `
    @awsCommon
if ($LASTEXITCODE -ne 0) { Write-Err2 "Upload installer fallito"; exit 1 }
Write-Ok "Installer caricato"

Write-Step "Upload manifest  -> s3://$Bucket/$manifestKey"
& aws s3 cp $manifestPath "s3://$Bucket/$manifestKey" `
    --content-type 'application/json' `
    --cache-control 'public, max-age=300, must-revalidate' `
    @awsCommon
if ($LASTEXITCODE -ne 0) { Write-Err2 "Upload manifest fallito"; exit 1 }
Write-Ok "Manifest caricato"

# Verifica end-to-end: scarichiamo il manifest pubblico e confermiamo
# che la version dichiarata corrisponde a quella appena pubblicata.
# Catches: cache R2 stale, propagazione edge incompleta, key sbagliata.
Write-Step "Verifica manifest pubblico"
try {
    $publicManifest = Invoke-RestMethod -Uri "$PublicBase/$manifestKey" -Headers @{ 'Cache-Control' = 'no-cache' } -TimeoutSec 15
    if ($publicManifest.version -ne $newVersion) {
        Write-Warn2 "ATTENZIONE: manifest pubblico ancora a versione '$($publicManifest.version)' invece di '$newVersion'."
        Write-Warn2 "Probabile cache CDN R2 stale: i client riceveranno il manifest vecchio finche' non scade (TTL 5min)."
    } else {
        Write-Ok "Manifest pubblico verificato: version=$newVersion, sha256=$($publicManifest.sha256.Substring(0,12))..."
    }
    if ($publicManifest.sha256 -and $publicManifest.sha256 -ne $hash) {
        Write-Err2 "SHA-256 nel manifest pubblico ($($publicManifest.sha256)) NON coincide con build locale ($hash)."
        Write-Err2 "Il client rifiutera' l'installer scaricato. Forza re-upload o aspetta scadenza cache."
    }
} catch {
    Write-Warn2 "Impossibile verificare manifest pubblico: $($_.Exception.Message)"
}

Write-Section 'Done'
Write-Ok "Bookeeper $newVersion pubblicato sul canale '$Channel'"
Write-Host "    Installer: $installerUrl" -ForegroundColor DarkGray
Write-Host "    Manifest : $PublicBase/$manifestKey" -ForegroundColor DarkGray
Write-Host ""
Write-Warn2 "Suggerimento: tagga la release con 'git tag desktop-v$newVersion ; git push --tags'"
