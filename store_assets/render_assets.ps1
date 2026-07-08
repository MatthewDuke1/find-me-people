# Render the Sula store-asset pages to PNG with headless Chrome.
# Run from store_assets/:  powershell -File render_assets.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$Chrome = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $Chrome) { throw "Chrome not found" }

$Assets = @(
  @{ In = "shot1_hero.html";          Out = "screenshot_1_hero_1280x800.png";          W = 1280; H = 800 },
  @{ In = "shot2_autoscan.html";      Out = "screenshot_2_autoscan_1280x800.png";      W = 1280; H = 800 },
  @{ In = "shot3_ranking.html";       Out = "screenshot_3_scoring_1280x800.png";       W = 1280; H = 800 },
  @{ In = "shot4_copy.html";          Out = "screenshot_4_copy_1280x800.png";          W = 1280; H = 800 },
  @{ In = "shot5_support_pages.html"; Out = "screenshot_5_support_pages_1280x800.png"; W = 1280; H = 800 },
  @{ In = "small_promo.html";         Out = "small_promo_440x280.png";                 W = 440;  H = 280 },
  @{ In = "marquee_promo.html";       Out = "marquee_promo_1400x560.png";              W = 1400; H = 560 },
  @{ In = "social_card.html";         Out = "social_card_1200x630.png";                W = 1200; H = 630 }
)

# Chrome's sandbox refuses to write into some directories; render to TEMP
# with an absolute path, then copy the PNG back next to the sources.
$Work = Join-Path $env:TEMP "sula_assets"
New-Item -ItemType Directory -Force $Work | Out-Null

foreach ($a in $Assets) {
  $uri = "file:///" + ((Resolve-Path $a.In).Path -replace '\\', '/')
  $tmp = Join-Path $Work $a.Out
  if (Test-Path $tmp) { Remove-Item -Force $tmp }
  # Start-Process avoids PowerShell 5.1 turning Chrome's stderr status
  # line into a terminating NativeCommandError.
  Start-Process -FilePath $Chrome -Wait -WindowStyle Hidden -ArgumentList @(
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    "--window-size=$($a.W),$($a.H)", "--screenshot=$tmp",
    '--virtual-time-budget=5000', $uri
  ) | Out-Null
  if (Test-Path $tmp) {
    Copy-Item -Force $tmp $a.Out
    Write-Output ("rendered " + $a.Out)
  } else { Write-Output ("FAILED " + $a.Out) }
}
