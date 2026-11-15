$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot 'extension'))
$sourcePrefix = $sourceRoot + [IO.Path]::DirectorySeparatorChar
$manifest = Get-Content -LiteralPath (Join-Path $sourceRoot 'manifest.json') -Raw | ConvertFrom-Json
$package = Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json
if ($manifest.version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$' -or $manifest.version -cne $package.version) {
    throw 'Package and manifest versions must agree and be a valid extension version.'
}

# Snapshot every source file, including hidden files, before creating any output.
# Reject links; include the repository license explicitly below.
$sources = @{}
Get-ChildItem -LiteralPath $sourceRoot -Recurse -Force | ForEach-Object {
    if ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Source links are not supported: $($_.FullName)" }
    if (-not $_.PSIsContainer) {
        $name = $_.FullName.Substring($sourcePrefix.Length).Replace('\', '/')
        $sources[$name] = @{ Path = $_.FullName; Hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
    }
}

$license = Get-Item -LiteralPath (Join-Path $repoRoot 'LICENSE')
if ($license.PSIsContainer -or ($license.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'LICENSE must be a regular file.'
}
$sources['LICENSE'] = @{ Path = $license.FullName; Hash = (Get-FileHash -LiteralPath $license.FullName -Algorithm SHA256).Hash }

function Assert-Asset([string] $name) {
    if ([string]::IsNullOrWhiteSpace($name) -or $name.Contains('\') -or
        $name.StartsWith('/') -or $name -match '(^|/)\.\.(/|$)|[:?#]' -or -not $sources.ContainsKey($name)) {
        throw "Missing or invalid extension asset: $name"
    }
}

$assets = @('manifest.json', 'LICENSE')
foreach ($content in $manifest.content_scripts) { $assets += @($content.js) + @($content.css) }
foreach ($icons in @($manifest.icons, $manifest.action.default_icon)) {
    if ($icons -is [string]) { $assets += $icons }
    elseif ($null -ne $icons) { $assets += @($icons.PSObject.Properties.Value) }
}
$assets += @($manifest.background.service_worker) + @($manifest.background.scripts)
$assets += @($manifest.options_page, $manifest.options_ui.page)
$popup = $manifest.action.default_popup
if ($popup) {
    Assert-Asset $popup
    $assets += $popup
    # Include the popup's local scripts, styles, and images, resolved from its directory.
    $html = Get-Content -LiteralPath $sources[$popup].Path -Raw
    foreach ($match in [regex]::Matches($html, '(?i)\b(?:src|href)\s*=\s*["'']([^"'']+)["'']')) {
        $reference = $match.Groups[1].Value
        $resolved = [IO.Path]::GetFullPath((Join-Path (Split-Path $sources[$popup].Path -Parent) $reference))
        if (-not $resolved.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
            throw "Popup asset is outside extension/: $reference"
        }
        $assets += $resolved.Substring($sourcePrefix.Length).Replace('\', '/')
    }
}
foreach ($asset in $assets) { if ($null -ne $asset) { Assert-Asset $asset } }

$outputDirectory = Join-Path $repoRoot 'dist'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$archive = Join-Path $outputDirectory ("twitch-min-{0}.zip" -f $manifest.version)
$temporaryArchive = Join-Path $outputDirectory ('.package-' + [guid]::NewGuid().ToString('N') + '.zip')
try {
    $zip = [IO.Compression.ZipFile]::Open($temporaryArchive, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($name in ($sources.Keys | Sort-Object)) {
            [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $sources[$name].Path, $name) | Out-Null
        }
    } finally { $zip.Dispose() }

    $zip = [IO.Compression.ZipFile]::OpenRead($temporaryArchive)
    try {
        if ($zip.Entries.Count -ne $sources.Count) { throw 'Archive file count differs from source.' }
        $seen = @{}
        foreach ($entry in $zip.Entries) {
            $name = $entry.FullName
            if (-not $sources.ContainsKey($name) -or $seen.ContainsKey($name)) { throw "Unexpected archive entry: $name" }
            $seen[$name] = $true
            $stream = $entry.Open()
            $sha = [Security.Cryptography.SHA256]::Create()
            try { $hash = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
            finally { $stream.Dispose(); $sha.Dispose() }
            if ($hash -cne $sources[$name].Hash) { throw "Archive content differs from source: $name" }
        }
        foreach ($asset in $assets) {
            if ($null -ne $asset -and $null -eq $zip.GetEntry($asset)) { throw "Missing archive asset: $asset" }
        }
        $reader = [IO.StreamReader]::new($zip.GetEntry('manifest.json').Open())
        try { $archivedManifest = $reader.ReadToEnd() | ConvertFrom-Json } finally { $reader.Dispose() }
        if ($archivedManifest.version -cne $package.version) { throw 'Archived manifest version differs from package.' }
    } finally { $zip.Dispose() }

    # Replace only after validation; same-directory replacement preserves the old
    # release if validation or the final filesystem operation fails.
    if (Test-Path -LiteralPath $archive) { [IO.File]::Replace($temporaryArchive, $archive, [NullString]::Value) }
    else { [IO.File]::Move($temporaryArchive, $archive) }
    Write-Output $archive
} finally {
    if (Test-Path -LiteralPath $temporaryArchive) { Remove-Item -LiteralPath $temporaryArchive -Force }
}
