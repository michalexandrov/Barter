# Rebuilds the "dist" folder and "dist.zip" used for publishing the dashboard.
# Only public files are copied - CLAUDE.md, README.md and this script are NOT published.
# Usage:  powershell -ExecutionPolicy Bypass -File .\build-dist.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$dist = Join-Path $root 'dist'
$zip  = Join-Path $root 'dist.zip'

# 1. Clean
if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
if (Test-Path $zip)  { Remove-Item $zip -Force }

# 2. Copy site files (index.html must stay at the archive root)
New-Item -ItemType Directory -Force -Path $dist | Out-Null
Copy-Item (Join-Path $root 'index.html') -Destination $dist
Copy-Item (Join-Path $root 'styles.css') -Destination $dist
Copy-Item (Join-Path $root 'app.js')     -Destination $dist
Copy-Item (Join-Path $root 'vendor')     -Destination $dist -Recurse

# 3. Pack to a single zip (easier to drag into Netlify Drop)
Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zip -Force

Write-Host ''
Write-Host 'Ready to publish:' -ForegroundColor Green
Get-ChildItem $dist -Recurse -File |
    Select-Object @{n = 'File'; e = { $_.FullName.Replace("$dist\", '') } },
                  @{n = 'KB';   e = { [math]::Round($_.Length / 1KB) } } |
    Format-Table -AutoSize | Out-String | Write-Host
Write-Host "Zip: $zip" -ForegroundColor Green
