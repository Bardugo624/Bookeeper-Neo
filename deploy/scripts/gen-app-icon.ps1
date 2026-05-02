#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Genera l'icona Bookeeper on-brand:
    - clients/desktop/build/appicon.png   (1024x1024, fonte Wails)
    - clients/desktop/build/windows/icon.ico  (multi-size: 16/32/48/64/128/256)

  Design: tile sage arrotondata + glyph "libro aperto" cream.
  Brand:  sage #4d8369 / cream #fbfaf8.

  Usa solo System.Drawing (no dipendenze esterne).
  L'ICO multi-size e' costruito a mano: 16/32/48/64 come BMP DIB,
  128/256 come PNG embedded (formato Vista+).
#>

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$buildDir = Join-Path $repoRoot 'clients\desktop\build'
$appiconPath = Join-Path $buildDir 'appicon.png'
$icoPath = Join-Path $buildDir 'windows\icon.ico'

# ---- Brand tokens (matched a clients/mobile-web/public/favicon.svg) ---------
# Tile sage scuro (#305545), book outline cream (#f1f7f4). Stesso glifo del
# favicon web cosi' l'identita' e' coerente su web/installer/exe/taskbar.
$sageDark = [System.Drawing.Color]::FromArgb(0xFF, 0x30, 0x55, 0x45)
$cream = [System.Drawing.Color]::FromArgb(0xFF, 0xf1, 0xf7, 0xf4)

function New-AppIconBitmap {
    param([int]$Size)

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # ---- Tile sage rounded (radius = 12/64 dell'SVG ≈ 18.75%) -----------
    $r = [int]([math]::Round($Size * 12.0 / 64.0))
    $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tile.AddArc(0, 0, $r * 2, $r * 2, 180, 90)
    $tile.AddArc($Size - $r * 2, 0, $r * 2, $r * 2, 270, 90)
    $tile.AddArc($Size - $r * 2, $Size - $r * 2, $r * 2, $r * 2, 0, 90)
    $tile.AddArc(0, $Size - $r * 2, $r * 2, $r * 2, 90, 90)
    $tile.CloseFigure()

    $brushBg = New-Object System.Drawing.SolidBrush $sageDark
    $g.FillPath($brushBg, $tile)
    $brushBg.Dispose()

    # ---- Book glyph (porting fedele dell'SVG, scala 64 -> $Size) ---------
    # SVG path 1: M16 14 h26 a6 6 0 0 1 6 6 v30 H22 a6 6 0 0 1 -6 -6 V14 z
    # SVG path 2: M16 44 a6 6 0 0 1 6 -6 h26
    # stroke-width 3 in viewport 64 → scala lineare.
    $scale = $Size / 64.0
    $strokeW = [float](3 * $scale)
    $arcR = [float](6 * $scale)

    $pen = New-Object System.Drawing.Pen $cream, $strokeW
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    # Path 1: profilo "D" del libro
    $p1 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $x16 = [float](16 * $scale)
    $y14 = [float](14 * $scale)
    $x42 = [float](42 * $scale)
    $x48 = [float](48 * $scale)
    $y20 = [float](20 * $scale)
    $y50 = [float](50 * $scale)
    $x22 = [float](22 * $scale)
    $y44 = [float](44 * $scale)

    # M16 14 → linea fino a (42,14)
    $p1.AddLine($x16, $y14, $x42, $y14)
    # arc a6 6 0 0 1 6 6 → arco da (42,14) a (48,20), centro (42,20)
    $p1.AddArc($x42 - $arcR, $y14, $arcR * 2, $arcR * 2, 270, 90)
    # v30 → linea fino a (48,50)
    $p1.AddLine($x48, $y20, $x48, $y50)
    # H22 → linea fino a (22,50)
    $p1.AddLine($x48, $y50, $x22, $y50)
    # arc a6 6 0 0 1 -6 -6 → arco da (22,50) a (16,44), centro (22,44)
    $p1.AddArc($x22 - $arcR, $y44 - $arcR, $arcR * 2, $arcR * 2, 90, 90)
    # V14 → linea fino a (16,14) — chiusura
    $p1.AddLine($x16, $y44, $x16, $y14)

    $g.DrawPath($pen, $p1)

    # Path 2: linguetta inferiore — M16 44 a6 6 0 0 1 6 -6 h26
    $p2 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $y38 = [float](38 * $scale)
    # arco da (16,44) a (22,38), centro (22,44)
    $p2.AddArc($x22 - $arcR, $y44 - $arcR, $arcR * 2, $arcR * 2, 180, 90)
    # h26 → linea fino a (48,38)
    $p2.AddLine($x22, $y38, $x48, $y38)

    $g.DrawPath($pen, $p2)

    $pen.Dispose()
    $p1.Dispose()
    $p2.Dispose()
    $tile.Dispose()
    $g.Dispose()
    return $bmp
}

# ---- 1) appicon.png 1024 -----------------------------------------------------
Write-Host "→ Generating appicon.png (1024x1024)..." -ForegroundColor Cyan
$big = New-AppIconBitmap -Size 1024
$big.Save($appiconPath, [System.Drawing.Imaging.ImageFormat]::Png)
$big.Dispose()
Write-Host "  saved: $appiconPath" -ForegroundColor Green

# ---- 2) icon.ico multi-size --------------------------------------------------
# Formato ICO:
#   ICONDIR (6 bytes): reserved=0, type=1, count
#   ICONDIRENTRY * count (16 bytes ognuno):
#       width(1) height(1) colors(1) reserved(1) planes(2) bitcount(2)
#       bytesInRes(4) imageOffset(4)
#   Image data (BMP DIB without file header, OR PNG blob)
# Per >64px usiamo PNG embedded (PNG-in-ICO, supportato da Vista+).
Write-Host "→ Generating icon.ico (multi-size)..." -ForegroundColor Cyan
$sizes = @(16, 32, 48, 64, 128, 256)
$entries = @()
foreach ($s in $sizes) {
    $bmp = New-AppIconBitmap -Size $s
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    $entries += [pscustomobject]@{
        Size = $s
        Data = $ms.ToArray()
    }
    $ms.Dispose()
}

$out = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $out
# ICONDIR
$bw.Write([uint16]0)          # reserved
$bw.Write([uint16]1)          # type = 1 (icon)
$bw.Write([uint16]$entries.Count)

# Calcola offset dati: header 6 + 16*N entries
$dataOffset = 6 + (16 * $entries.Count)
foreach ($e in $entries) {
    $w = if ($e.Size -ge 256) { 0 } else { $e.Size }
    $bw.Write([byte]$w)            # width  (0 == 256)
    $bw.Write([byte]$w)            # height
    $bw.Write([byte]0)            # color palette count
    $bw.Write([byte]0)            # reserved
    $bw.Write([uint16]1)          # planes
    $bw.Write([uint16]32)         # bit count
    $bw.Write([uint32]$e.Data.Length)
    $bw.Write([uint32]$dataOffset)
    $dataOffset += $e.Data.Length
}
foreach ($e in $entries) {
    $bw.Write($e.Data)
}
$bw.Flush()
[System.IO.File]::WriteAllBytes($icoPath, $out.ToArray())
$bw.Dispose()
$out.Dispose()
Write-Host "  saved: $icoPath ($((Get-Item $icoPath).Length) bytes)" -ForegroundColor Green

Write-Host "`nDone. Riesegui 'wails build --nsis' per applicare l icona all exe e all installer." -ForegroundColor Green
