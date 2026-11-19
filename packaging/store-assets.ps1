param([Parameter(Mandatory=$true)][string]$Icon,[Parameter(Mandatory=$true)][string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$source = [System.Drawing.Image]::FromFile($Icon)
try {
  foreach ($item in @(@('StoreLogo.png',50),@('Square150x150Logo.png',150),@('Square44x44Logo.png',44))) {
    $size = [int]$item[1]
    $bitmap = New-Object System.Drawing.Bitmap($size,$size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.DrawImage($source,0,0,$size,$size)
      $bitmap.Save((Join-Path $Destination $item[0]),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
} finally { $source.Dispose() }
