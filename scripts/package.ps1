$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $repoRoot 'extension\manifest.json') -Raw | ConvertFrom-Json
$outputDirectory = Join-Path $repoRoot 'dist'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$archive = Join-Path $outputDirectory ("twitch-min-{0}.zip" -f $manifest.version)
Compress-Archive -Path (Join-Path $repoRoot 'extension\*') -DestinationPath $archive -Force
Write-Output $archive
