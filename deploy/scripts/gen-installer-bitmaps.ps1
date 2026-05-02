# gen-installer-bitmaps.ps1 — genera header.bmp e wizard.bmp brandizzati
# per l'installer NSIS di Bookeeper. Sage palette (#4d8369), cream (#fbfaf8).
#
# Uso:   pwsh -File ./gen-installer-bitmaps.ps1
# Output: clients/desktop/build/windows/installer/header.bmp + wizard.bmp
param(
    [string]$OutDir = "$PSScriptRoot/../../clients/desktop/build/windows/installer"
)
Add-Type -AssemblyName System.Drawing

function New-SageBitmap {
    param([int]$W, [int]$H, [string]$Path, [string]$Mode)
    $bmp = New-Object System.Drawing.Bitmap $W, $H
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.TextRenderingHint = 'AntiAliasGridFit'

    $rect = New-Object System.Drawing.Rectangle 0, 0, $W, $H
    $c1 = [System.Drawing.Color]::FromArgb(255, 77, 131, 105)
    $c2 = [System.Drawing.Color]::FromArgb(255, 56, 102, 80)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect, $c1, $c2, 135)
    $g.FillRectangle($brush, $rect)

    $cream = [System.Drawing.Color]::FromArgb(255, 251, 250, 248)
    $brushCream = New-Object System.Drawing.SolidBrush $cream

    if ($Mode -eq 'header') {
        # 150x57 — header MUI (top-right durante install)
        $font = New-Object System.Drawing.Font('Segoe UI', 14, [System.Drawing.FontStyle]::Bold)
        $g.DrawString('Bookeeper', $font, $brushCream, 12, 16)
        $font.Dispose()
    } else {
        # 164x314 — welcome/finish wizard (full-bleed sinistra)
        $fontBig = New-Object System.Drawing.Font('Georgia', 96, [System.Drawing.FontStyle]::Bold)
        $sf = New-Object System.Drawing.StringFormat
        $sf.Alignment = 'Center'
        $sf.LineAlignment = 'Center'
        $g.DrawString('B', $fontBig, $brushCream,
            (New-Object System.Drawing.RectangleF 0, 70, $W, 140), $sf)

        $fontSmall = New-Object System.Drawing.Font('Segoe UI', 10, [System.Drawing.FontStyle]::Regular)
        $g.DrawString('la tua biblioteca', $fontSmall, $brushCream,
            (New-Object System.Drawing.RectangleF 0, 235, $W, 18), $sf)
        $g.DrawString('personale', $fontSmall, $brushCream,
            (New-Object System.Drawing.RectangleF 0, 252, $W, 18), $sf)
        $fontBig.Dispose(); $fontSmall.Dispose()
    }

    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Bmp)
    $g.Dispose(); $bmp.Dispose(); $brush.Dispose(); $brushCream.Dispose()
    Write-Host "  + $Path  ($W x $H)"
}

if (-not (Test-Path $OutDir)) {
    Write-Error "OutDir non trovato: $OutDir"
    exit 1
}

Write-Host ">> Genero bitmap installer in: $OutDir"
New-SageBitmap -W 150 -H 57  -Path (Join-Path $OutDir 'header.bmp') -Mode 'header'
New-SageBitmap -W 164 -H 314 -Path (Join-Path $OutDir 'wizard.bmp') -Mode 'wizard'
Write-Host ">> Done."
