# TeamUpdater V3

Windows desktop app for mirroring selected ShareFile folders to `C:\` from the logged-in ShareFile mapped drive.

This project follows the repository-wide standards described in the root `AGENTS.md`.

## Features

- Auto-detects ShareFile mapped drives by probing `\[DriveLetter]\Folders\FBAU-PWS\DATA\For Laptops\CUSP\CUSP-Data`.
- Allows manual drive selection when auto-detection is ambiguous.
- Generates a preview before execution so operators can inspect copies, deletes, and firmware-retained files.
- Mirrors selected folders to `C:\[Folder]`.
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
- Windows machine with ShareFile exposed as a mapped drive

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

- Selected drive letter
- Enabled folder switches
- Firmware retention flag

Run history is stored separately in the local app data directory:

- `%LOCALAPPDATA%\TeamUpdaterV3\run-history.json`

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
- Browser preview cannot run sync operations; use the Tauri runtime for actual file copying.
- If the Tauri build fails with `cargo metadata ... program not found`, confirm the Rust toolchain is installed and that `%USERPROFILE%\.cargo\bin` is available in `PATH`.
- Windows packaging expects generated icon assets under `src-tauri/icons/`. Regenerate them with `pnpm tauri icon src-tauri/app-icon.svg -o src-tauri/icons` if they are missing.

## Testing

```powershell
pnpm lint
pnpm test -- --run
cd src-tauri; cargo test
pnpm build
pnpm tauri build --debug
```
