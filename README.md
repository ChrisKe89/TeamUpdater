# TeamUpdater V3

Windows desktop app for mirroring selected ShareFile folders to `C:\` from either the logged-in ShareFile mapped drive or the ShareFile REST API.

This project follows the repository-wide standards described in the root `AGENTS.md`.

## Features

- Auto-detects ShareFile mapped drives by probing `\[DriveLetter]\Folders\FBAU-PWS\DATA\For Laptops\CUSP\CUSP-Data`.
- Supports a ShareFile API source mode with OAuth 2.0 auth, remote folder browsing, and API-backed file download during sync.
- Allows manual drive selection when auto-detection is ambiguous.
- Generates a preview before execution so operators can inspect copies, deletes, and firmware-retained files.
- Mirrors selected folders to `C:\[Folder]` by default, with an overrideable destination root in settings.
- Keeps `CUSPAPPS` and `TeamOSB` mandatory and always enabled.
- Streams live progress, transfer logs, and deletion logs during sync.
- Supports optional firmware retention to preserve deletes under `*\Firmware\*`.
- Persists settings between sessions.
- Persists a local run history with completion state, counts, and recent file actions.
- Includes a bootstrap installation script for deploying or upgrading a packaged build in `C:\CUSPAPPS\TeamUpdaterV3\`.

## Quick start

### Prerequisites

- Node.js 20+
- `pnpm` 10+
- Rust stable toolchain
- Visual Studio 2022 Build Tools with the `Desktop development with C++` workload
- Windows machine with ShareFile exposed as a mapped drive, or a ShareFile OAuth app with client credentials and redirect URI

### Install dependencies

```powershell
pnpm install
```

### Run the web UI only

```powershell
pnpm dev
```

### Run the desktop app

```powershell
pnpm doctor:tauri
# If the doctor reports an uninitialized Visual Studio shell, initialize it in this PowerShell session:
& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
pnpm tauri dev
```

### Build the desktop app

```powershell
pnpm tauri build
```

## App structure

- `src/`: React UI, state handling, browser fallback, and tests.
- `src-tauri/src/`: Rust commands for settings persistence, drive detection, and mirror sync.
- `bootstrap/`: Deployment script for copying a packaged build into `C:\CUSPAPPS\TeamUpdaterV3\`.

## Configuration

Settings are stored as JSON in the user config directory:

- `%APPDATA%\TeamUpdaterV3\settings.json` on Windows systems using the standard config location.

Stored settings include:

- Selected source mode
- Selected drive letter
- Selected ShareFile API tenant and remote root folder
- Destination root
- Enabled folder switches
- Firmware retention flag

Run history is stored separately in the local app data directory:

- `%LOCALAPPDATA%\TeamUpdaterV3\run-history.json`

ShareFile auth material is stored separately from general settings:

- `%LOCALAPPDATA%\TeamUpdaterV3\sharefile-auth.json`

The auth store contains the OAuth client configuration needed to reconnect plus the current token set and pending auth state. Keep it restricted to the signed-in operator profile.

Desktop session logs are written beside the packaged executable:

- `Logs\YYYY-MM-DD_HH-MM-SS_logs.txt`

For the standard bootstrap install, that means:

- `C:\CUSPAPPS\TeamUpdaterV3\Logs\`

## Packaging and deployment

1. Build the Tauri app with `pnpm tauri build`.
2. Run the bootstrap script from `bootstrap/Install-TeamUpdaterV3.ps1`.
3. Point `-BundleSource` at either:
   - the unpacked application directory or executable for copy-based install/upgrade to `C:\CUSPAPPS\TeamUpdaterV3\`
   - the generated NSIS setup executable to run a silent installer flow
4. Use `-CreateDesktopShortcut` to add a shortcut during copy-based deployment.
5. Use `-NoLaunch` to suppress automatic startup after installation.

## Troubleshooting

- If the status indicator is red, use **Refresh drives** and verify the ShareFile mapped drive is mounted.
- If ShareFile API mode shows as disconnected, reopen **ShareFile auth**, complete the browser sign-in flow, and paste the full callback URL back into the app.
- Browser preview cannot run sync operations; use the Tauri runtime for actual file copying.
- If the packaged desktop UI blanks out or crashes during a run, inspect the latest file under `Logs\` beside the installed executable. The desktop session log includes backend sync messages plus frontend window errors and unhandled promise rejections.
- If the Tauri build fails with `cargo metadata ... program not found`, confirm the Rust toolchain is installed and that `%USERPROFILE%\.cargo\bin` is available in `PATH`.
- If `pnpm tauri dev` fails with `linker 'link.exe' not found`, run `pnpm doctor:tauri`. That error means Rust is using the Windows MSVC target but the Visual C++ linker is unavailable in the current shell.
- If `pnpm doctor:tauri` reports that `link.exe` is installed but missing from `PATH`, reopen the project in `x64 Native Tools Command Prompt for VS 2022`, or initialize the current PowerShell session with:

```powershell
& "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64
```

- After `VsDevCmd.bat` completes, rerun `pnpm tauri dev` in that same shell.
- If `pnpm doctor:tauri` reports that Build Tools are installed but the MSVC linker payload is missing, modify the installation to add `Microsoft.VisualStudio.Workload.VCTools` and `Microsoft.VisualStudio.Component.VC.Tools.x86.x64`.
- If `pnpm doctor:tauri` reports that Build Tools are not installed, install Visual Studio Build Tools 2022 with the `Desktop development with C++` workload. VS Code alone is not sufficient.
- Windows packaging expects generated icon assets under `src-tauri/icons/`. Regenerate them with `pnpm tauri icon src-tauri/app-icon.svg -o src-tauri/icons` if they are missing.

## Testing

```powershell
pnpm lint
pnpm test -- --run
cd src-tauri; cargo test
pnpm build
pnpm tauri build --debug
```
