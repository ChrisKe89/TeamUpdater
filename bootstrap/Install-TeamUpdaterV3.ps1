[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BundleSource,

  [switch]$CreateDesktopShortcut
)

$ErrorActionPreference = 'Stop'

$targetRoot = 'C:\CUSPAPPS\TeamUpdaterV3'
$targetExe = Join-Path $targetRoot 'TeamUpdaterV3.exe'

if (-not (Test-Path $BundleSource)) {
  throw "Bundle source not found: $BundleSource"
}

New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

if ((Get-Item $BundleSource).PSIsContainer) {
  Copy-Item -Path (Join-Path $BundleSource '*') -Destination $targetRoot -Recurse -Force
} else {
  Copy-Item -Path $BundleSource -Destination $targetExe -Force
}

if ($CreateDesktopShortcut) {
  $desktopPath = [Environment]::GetFolderPath('Desktop')
  $shortcutPath = Join-Path $desktopPath 'TeamUpdaterV3.lnk'
  $wshShell = New-Object -ComObject WScript.Shell
  $shortcut = $wshShell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $targetExe
  $shortcut.WorkingDirectory = $targetRoot
  $shortcut.Save()
}

Start-Process -FilePath $targetExe
