#requires -Version 7
# End-to-end check of the Windows Setup on a runner: install, upgrade, uninstall.
# Every process is awaited with Start-Process -Wait -PassThru and its exit code checked.
# Arguments go to Start-Process as ONE string so spaces and accents arrive untouched.
param(
    [Parameter(Mandatory)][string]$Setup,    # the complete Bookeeper-Setup-<version>.exe
    [Parameter(Mandatory)][string]$Classic,  # the NSIS installer
    [Parameter(Mandatory)][string]$Main      # bookeeper-desktop.exe of the build
)
$ErrorActionPreference = 'Stop'

$Dir = 'C:\Prova Bookeeper\Libreria è'
$DataId = 'org.bookeeper.desktop'
$Roaming = Join-Path $env:APPDATA $DataId
$Local = Join-Path $env:LOCALAPPDATA $DataId
$UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Bookeeper'
$InstallKey = 'HKCU:\Software\bookeeper\Bookeeper'
$RunKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$Credentials = @("smoke-one.$DataId", "smoke-two.$DataId")

function Fail([string]$what, $expected, $found) {
    Write-Host "FAIL: $what"
    Write-Host "  expected: $expected"
    Write-Host "  found:    $found"
    exit 1
}
function Expect([string]$what, $expected, $found) {
    if ("$expected" -ne "$found") { Fail $what $expected $found }
}
function Run([string]$exe, [string]$arguments) {
    Write-Host ">> $exe $arguments"
    $p = Start-Process -FilePath $exe -ArgumentList $arguments -Wait -PassThru
    return $p.ExitCode
}
function ExpectExit([string]$what, [string]$exe, [string]$arguments) {
    Expect "$what: exit code" 0 (Run $exe $arguments)
}
function ExpectPath([string]$what, [string]$path, [bool]$present) {
    Expect "$what ($path) exists" $present (Test-Path -LiteralPath $path)
}
function UninstallString() {
    $item = Get-ItemProperty -Path $UninstallKey -ErrorAction SilentlyContinue
    if ($item) { return $item.UninstallString } else { return '<no key>' }
}
function Shortcuts() {
    $programs = [Environment]::GetFolderPath('Programs')
    $desktop = [Environment]::GetFolderPath('Desktop')
    return @{
        Start   = @(Get-ChildItem -Path $programs -Filter 'Bookeeper*.lnk' -Recurse -ErrorAction SilentlyContinue)
        Desktop = @(Get-ChildItem -Path $desktop -Filter 'Bookeeper*.lnk' -ErrorAction SilentlyContinue)
    }
}
function CredentialPresent([string]$name) {
    return [bool](cmdkey /list | Select-String -SimpleMatch $name)
}
function Install() {
    ExpectExit 'quiet install' $Setup "--quiet `"--dir=$Dir`""
}

$expectedUninstall = "`"$Dir\bookeeper-setup.exe`" --uninstall"

Write-Host '== 1. --smoke-ui'
ExpectExit '--smoke-ui' $Setup '--smoke-ui'

Write-Host '== 2. quiet install'
Install
foreach ($f in 'bookeeper-desktop.exe', 'bookeeper-setup.exe', 'uninstall.exe') {
    ExpectPath "installed file $f" (Join-Path $Dir $f) $true
}
Expect 'bookeeper-desktop.exe SHA-256' (Get-FileHash -Algorithm SHA256 $Main).Hash `
    (Get-FileHash -Algorithm SHA256 (Join-Path $Dir 'bookeeper-desktop.exe')).Hash
Expect 'UninstallString' $expectedUninstall (UninstallString)
$links = Shortcuts
Expect 'Start menu shortcut count > 0' $true ($links.Start.Count -gt 0)
Expect 'desktop shortcut count > 0' $true ($links.Desktop.Count -gt 0)

Write-Host '== 3. classic installer over the installation (/P /UPDATE)'
ExpectExit 'classic /P /UPDATE' $Classic '/P /UPDATE'
Expect 'UninstallString after the update' $expectedUninstall (UninstallString)

Write-Host '== 4. uninstall as the NSIS page does'
ExpectExit 'uninstall with _?=' (Join-Path $Dir 'bookeeper-setup.exe') "--uninstall /P _?=$Dir"
ExpectPath 'bookeeper-desktop.exe right after the uninstaller returned' (Join-Path $Dir 'bookeeper-desktop.exe') $false

Write-Host '== 5. uninstall keeps the data'
Install
New-Item -ItemType Directory -Force -Path $Roaming | Out-Null
Set-Content -LiteralPath (Join-Path $Roaming 'bookeeper.sqlite') -Value 'not a real database'
foreach ($c in $Credentials) {
    cmdkey "/generic:$c" /user:smoke /pass:smoke | Out-Null
}
ExpectExit 'uninstall --quiet' (Join-Path $Dir 'bookeeper-setup.exe') '--uninstall --quiet'
ExpectPath 'database kept' (Join-Path $Roaming 'bookeeper.sqlite') $true
foreach ($c in $Credentials) { Expect "credential $c kept" $true (CredentialPresent $c) }

Write-Host '== 6. uninstall deletes the data'
Install
New-Item -ItemType Directory -Force -Path $Local | Out-Null
ExpectExit 'uninstall --delete-data' (Join-Path $Dir 'bookeeper-setup.exe') '--uninstall --quiet --delete-data'
ExpectPath 'roaming data folder' $Roaming $false
ExpectPath 'local data folder' $Local $false
foreach ($c in $Credentials) { Expect "credential $c removed" $false (CredentialPresent $c) }
ExpectPath 'HKCU Software\bookeeper\Bookeeper' $InstallKey $false
$run = Get-ItemProperty -Path $RunKey -Name 'Bookeeper' -ErrorAction SilentlyContinue
Expect 'Run\Bookeeper value' 'absent' ($(if ($run) { 'present' } else { 'absent' }))
# The uninstaller deletes itself after exiting: wait up to 10 s.
$deadline = (Get-Date).AddSeconds(10)
while ((Test-Path -LiteralPath $Dir) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
ExpectPath 'installation folder' $Dir $false

Write-Host 'Smoke test passed.'
exit 0
