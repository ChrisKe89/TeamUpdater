[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$BundleSource,

  [switch]$CreateDesktopShortcut,

  [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'

$targetRoot = 'C:\CUSPAPPS\TeamUpdaterV3'
$targetExe = Join-Path $targetRoot 'TeamUpdaterV3.exe'
$backupRoot = Join-Path ([System.IO.Path]::GetTempPath()) 'TeamUpdaterV3-backup'

function New-TeamUpdaterShortcut {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ExecutablePath,
    [Parameter(Mandatory = $true)]
    [string]$WorkingDirectory
  )

  $desktopPath = [Environment]::GetFolderPath('Desktop')
  $shortcutPath = Join-Path $desktopPath 'TeamUpdaterV3.lnk'
  $wshShell = New-Object -ComObject WScript.Shell
  $shortcut = $wshShell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $ExecutablePath
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.Save()
}

function Restore-Backup {
  if (Test-Path $targetRoot) {
    Remove-Item -Path $targetRoot -Recurse -Force
  }

  if (Test-Path $backupRoot) {
    Move-Item -Path $backupRoot -Destination $targetRoot -Force
  }
}

if (-not (Test-Path $BundleSource)) {
  throw "Bundle source not found: $BundleSource"
}

if (Test-Path $backupRoot) {
  Remove-Item -Path $backupRoot -Recurse -Force
}

$sourceItem = Get-Item $BundleSource
$isInstaller = -not $sourceItem.PSIsContainer -and $sourceItem.Extension -ieq '.exe' -and $sourceItem.Name -match 'setup'

if ($isInstaller) {
  Write-Host "Running NSIS installer silently: $($sourceItem.FullName)"
  $process = Start-Process -FilePath $sourceItem.FullName -ArgumentList '/S' -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Installer failed with exit code $($process.ExitCode)"
  }
  return
}

if (Test-Path $targetRoot) {
  Move-Item -Path $targetRoot -Destination $backupRoot -Force
}

try {
  New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null

  if ($sourceItem.PSIsContainer) {
    Copy-Item -Path (Join-Path $sourceItem.FullName '*') -Destination $targetRoot -Recurse -Force
  }
  else {
    Copy-Item -Path $sourceItem.FullName -Destination $targetExe -Force
  }

  if (-not (Test-Path $targetExe)) {
    throw "Expected executable not found after install: $targetExe"
  }

  if ($CreateDesktopShortcut) {
    New-TeamUpdaterShortcut -ExecutablePath $targetExe -WorkingDirectory $targetRoot
  }

  if (Test-Path $backupRoot) {
    Remove-Item -Path $backupRoot -Recurse -Force
  }

  if (-not $NoLaunch) {
    Start-Process -FilePath $targetExe -WorkingDirectory $targetRoot
  }
}
catch {
  Restore-Backup
  throw
}
