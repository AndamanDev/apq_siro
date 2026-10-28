# สร้างไฟล์ไอคอน .ico แบบหลายความละเอียดจาก PNG สี่เหลี่ยมจัตุรัส
# ใช้รูปแบบ ICO ที่ฝัง PNG (รองรับ Windows Vista ขึ้นไป) จึงคมชัดทุกขนาด
# เรียกใช้: powershell -ExecutionPolicy Bypass -File make-icon.ps1
param(
  [string]$Source = "$PSScriptRoot\renderer\kiosk_logo2.png",
  [string]$Out    = "$PSScriptRoot\build\icon.ico"
)
Add-Type -AssemblyName System.Drawing

$sizes = 256, 128, 64, 48, 32, 16
$src = [System.Drawing.Image]::FromFile((Resolve-Path $Source))

# เรนเดอร์แต่ละขนาดเป็น PNG เก็บไว้ในหน่วยความจำ
$pngs = foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($src, 0, 0, $s, $s)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  [pscustomobject]@{ Size = $s; Bytes = $ms.ToArray() }
}
$src.Dispose()

$dir = Split-Path $Out -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }

$fs = [System.IO.File]::Create($Out)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR header
$bw.Write([uint16]0)               # reserved
$bw.Write([uint16]1)               # type = icon
$bw.Write([uint16]$pngs.Count)     # จำนวนภาพ

# ตำแหน่งข้อมูลภาพแรก = หลัง header(6) + directory entries(16 ต่ออัน)
$offset = 6 + (16 * $pngs.Count)
foreach ($p in $pngs) {
  $dim = if ($p.Size -ge 256) { 0 } else { $p.Size }  # 256 เก็บเป็น 0 ตามสเปก
  $bw.Write([byte]$dim)            # width
  $bw.Write([byte]$dim)            # height
  $bw.Write([byte]0)               # palette
  $bw.Write([byte]0)               # reserved
  $bw.Write([uint16]1)             # color planes
  $bw.Write([uint16]32)            # bits per pixel
  $bw.Write([uint32]$p.Bytes.Length)
  $bw.Write([uint32]$offset)
  $offset += $p.Bytes.Length
}
foreach ($p in $pngs) { $bw.Write($p.Bytes) }

$bw.Flush(); $bw.Close(); $fs.Close()
$len = (Get-Item $Out).Length
Write-Output ("Icon created: {0} ({1} bytes, {2} sizes)" -f $Out, $len, $pngs.Count)
