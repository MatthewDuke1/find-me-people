# Build script for Find Me People (Windows / PowerShell)
# Produces store-ready zips for Chrome Web Store and Firefox AMO.
# Uses System.IO.Compression directly so entry paths use forward slashes
# (required by the ZIP spec; AMO rejects backslash entries).
# Equivalent to build.sh -- use whichever matches your shell.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$OutDir = "dist"
$Files = @(
  "manifest.json",
  "background.js",
  "content.js",
  "popup.html",
  "popup.js",
  "PRIVACY_POLICY.md",
  "README.md"
)
$Dirs = @("icons")

if (Test-Path $OutDir) { Remove-Item -Recurse -Force $OutDir }
New-Item -ItemType Directory -Path $OutDir | Out-Null

function Write-ExtensionZip {
  param([string]$ZipPath)

  if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
  $stream = [System.IO.File]::Open((Resolve-Path -LiteralPath (Split-Path -Parent $ZipPath) | ForEach-Object { Join-Path $_ (Split-Path -Leaf $ZipPath) }), [System.IO.FileMode]::CreateNew)
  $archive = New-Object System.IO.Compression.ZipArchive($stream, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($file in $Files) {
      $full = Resolve-Path -LiteralPath $file
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $full, $file, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
    $rootPrefix = $PSScriptRoot.TrimEnd('\','/') + [System.IO.Path]::DirectorySeparatorChar
    foreach ($dir in $Dirs) {
      $root = (Resolve-Path -LiteralPath $dir).Path
      Get-ChildItem -LiteralPath $root -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($rootPrefix.Length).Replace('\', '/')
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
      }
    }
  } finally {
    $archive.Dispose()
    $stream.Dispose()
  }
}

$ChromeZip  = Join-Path $OutDir "find-me-people-chrome.zip"
$FirefoxZip = Join-Path $OutDir "find-me-people-firefox.zip"

Write-ExtensionZip -ZipPath $ChromeZip
Write-ExtensionZip -ZipPath $FirefoxZip

Write-Output "Built:"
Write-Output "  $ChromeZip   -> https://chrome.google.com/webstore/devconsole"
Write-Output "  $FirefoxZip  -> https://addons.mozilla.org/developers"
