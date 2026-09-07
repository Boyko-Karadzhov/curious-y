param([Parameter(Mandatory=$true)][string]$Manifest)
$ErrorActionPreference = 'Stop'
# Reuse the same matte cleanup, 512px geometry and margin checks as all Keeps.
& "$PSScriptRoot/import-generated-art.ps1" -LoadOnly
$repo = [System.IO.Path]::GetFullPath("$PSScriptRoot/..")
$entries = Get-Content -Raw -LiteralPath $Manifest | ConvertFrom-Json
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object MimeType -eq 'image/jpeg'
$quality = [System.Drawing.Imaging.EncoderParameters]::new(1)
$quality.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, [long]88)
foreach ($entry in $entries) {
  if ($entry.id -notmatch '^[a-z-]+$') { throw "Invalid asset id" }
  $destination = Join-Path $repo "public/assets/battle/worlds/$($entry.id)-v1"
  if ($entry.kind -eq 'castle') {
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    [GeneratedArtImport]::Run($entry.source, $destination, $true, -1, $true)
    Move-Item -LiteralPath "$destination/image.png" -Destination "$destination/castle.png" -Force
  } elseif ($entry.kind -eq 'background') {
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    $bitmap = [System.Drawing.Bitmap]::new($entry.source)
    try { $bitmap.Save("$destination/background.jpg", $jpeg, $quality) } finally { $bitmap.Dispose() }
  } else { throw "Unsupported asset kind: $($entry.kind)" }
  Write-Output "Imported $($entry.id) $($entry.kind)"
}
$quality.Dispose()
