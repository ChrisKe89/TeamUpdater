[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Write-CheckResult {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [Parameter(Mandatory = $true)]
    [bool]$Passed,
    [string]$Details
  )

  $status = if ($Passed) { 'PASS' } else { 'FAIL' }
  Write-Host "[$status] $Label"

  if ($Details) {
    Write-Host "       $Details"
  }
}

function Test-CommandAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Get-VisualStudioInstallPaths {
  $paths = [System.Collections.Generic.List[string]]::new()
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'

  if (Test-Path $vswhere) {
    $installations = & $vswhere -products * -property installationPath 2>$null

    foreach ($installation in $installations) {
      if (-not [string]::IsNullOrWhiteSpace($installation) -and -not $paths.Contains($installation)) {
        $paths.Add($installation)
      }
    }
  }

  $fallbackRoots = @(
    'C:\Program Files\Microsoft Visual Studio\2022\BuildTools',
    'C:\Program Files\Microsoft Visual Studio\2022\Community',
    'C:\Program Files\Microsoft Visual Studio\2022\Professional',
    'C:\Program Files\Microsoft Visual Studio\2022\Enterprise',
    'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools',
    'C:\Program Files (x86)\Microsoft Visual Studio\2022\Community',
    'C:\Program Files (x86)\Microsoft Visual Studio\2022\Professional',
    'C:\Program Files (x86)\Microsoft Visual Studio\2022\Enterprise'
  )

  foreach ($root in $fallbackRoots) {
    if ((Test-Path $root) -and -not $paths.Contains($root)) {
      $paths.Add($root)
    }
  }

  return $paths
}

function Find-MsvcLinker {
  $searchRoots = Get-VisualStudioInstallPaths |
    ForEach-Object { Join-Path $_ 'VC\Tools\MSVC' }

  foreach ($root in $searchRoots) {
    if (-not (Test-Path $root)) {
      continue
    }

    $candidate = Get-ChildItem -Path $root -Directory |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName 'bin\Hostx64\x64\link.exe' } |
      Where-Object { Test-Path $_ } |
      Select-Object -First 1

    if ($candidate) {
      return $candidate
    }
  }

  return $null
}

function Find-VsDevCmd {
  foreach ($root in Get-VisualStudioInstallPaths) {
    $candidate = Join-Path $root 'Common7\Tools\VsDevCmd.bat'

    if (Test-Path $candidate) {
      return $candidate
    }
  }

  return $null
}

$hasFailures = $false

$nodeOk = Test-CommandAvailable -Name 'node'
Write-CheckResult -Label 'Node.js available' -Passed $nodeOk -Details $(if ($nodeOk) { node -v } else { 'Install Node.js 20+.' })
$hasFailures = $hasFailures -or (-not $nodeOk)

$pnpmOk = Test-CommandAvailable -Name 'pnpm'
Write-CheckResult -Label 'pnpm available' -Passed $pnpmOk -Details $(if ($pnpmOk) { pnpm -v } else { 'Install pnpm 10+.' })
$hasFailures = $hasFailures -or (-not $pnpmOk)

$cargoOk = Test-CommandAvailable -Name 'cargo'
Write-CheckResult -Label 'Cargo available' -Passed $cargoOk -Details $(if ($cargoOk) { cargo -V } else { 'Install the Rust stable toolchain.' })
$hasFailures = $hasFailures -or (-not $cargoOk)

$toolchainLine = ''
$msvcTargetOk = $false
if ($cargoOk) {
  $toolchainLine = rustup show active-toolchain 2>$null
  $msvcTargetOk = $toolchainLine -match 'windows-msvc'
}

Write-CheckResult `
  -Label 'Rust toolchain targets windows-msvc' `
  -Passed $msvcTargetOk `
  -Details $(if ($toolchainLine) { $toolchainLine } else { 'Expected stable-x86_64-pc-windows-msvc.' })
$hasFailures = $hasFailures -or (-not $msvcTargetOk)

$linkCommand = Get-Command link.exe -ErrorAction SilentlyContinue
$linkOnPath = $null -ne $linkCommand
Write-CheckResult `
  -Label 'MSVC linker available in PATH' `
  -Passed $linkOnPath `
  -Details $(if ($linkOnPath) { $linkCommand.Source } else { 'Rust cannot compile Tauri without link.exe.' })
$hasFailures = $hasFailures -or (-not $linkOnPath)

if (-not $linkOnPath) {
  $installedLinker = Find-MsvcLinker
  $vsDevCmd = Find-VsDevCmd

  if ($installedLinker) {
    Write-Host ''
    Write-Host 'Visual C++ Build Tools appear to be installed, but this shell is missing the Visual Studio environment.'
    Write-Host "Detected linker: $installedLinker"
    if ($vsDevCmd) {
      Write-Host "Initialize the shell first with: `"$vsDevCmd`" -arch=x64 -host_arch=x64"
    }
    Write-Host 'Open a new "x64 Native Tools Command Prompt for VS 2022", or run VsDevCmd.bat before `pnpm tauri dev`.'
  }
  else {
    Write-Host ''
    if ($vsDevCmd) {
      Write-Host 'Visual Studio Build Tools are installed, but the MSVC linker payload was not found.'
      Write-Host 'Modify the installation to include the C++ toolchain components, then reopen the shell.'
      Write-Host 'Open Visual Studio Installer, choose Modify for Build Tools 2022, and add:'
      Write-Host '  - Desktop development with C++'
      Write-Host '  - MSVC v143 - VS 2022 C++ x64/x86 build tools'
    }
    else {
      Write-Host 'Visual C++ Build Tools were not detected.'
      Write-Host 'Install Visual Studio Build Tools 2022 with the "Desktop development with C++" workload, then reopen the shell.'
    }
  }
}

if ($hasFailures) {
  Write-Host ''
  Write-Host 'Toolchain check failed.'
  exit 1
}

Write-Host ''
Write-Host 'Toolchain check passed. `pnpm tauri dev` should be able to compile the Rust desktop runtime.'
