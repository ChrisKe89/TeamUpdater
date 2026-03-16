# TeamUpdater V3

Windows desktop app for mirroring selected ShareFile folders to `C:\` from the logged-in ShareFile mapped drive.

This project follows the repository-wide standards described in the root `AGENTS.md`.

## Features

- Auto-detects ShareFile mapped drives by probing `\[DriveLetter]\Folders\FBAU-PWS\DATA\For Laptops\CUSP\CUSP-Data`.
- Allows manual drive selection when auto-detection is ambiguous.
- Mirrors selected folders to `C:\[Folder]`.
- Keeps `CUSPAPPS` and `TeamOSB` mandatory and always enabled.
- Streams live progress, transfer logs, and deletion logs during sync.
- Supports optional firmware retention to preserve deletes under `*\Firmware\*`.
- Persists settings between sessions.
- Includes a bootstrap installation script for deploying a packaged build to `C:\CUSPAPPS\TeamUpdaterV3\`.

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

## Packaging and deployment

1. Build the Tauri app with `pnpm tauri build`.
2. Run the bootstrap script from `bootstrap/Install-TeamUpdaterV3.ps1`.
3. Point `-BundleSource` at the built bundle directory or executable.
4. Use `-CreateDesktopShortcut` to add a shortcut during deployment.

## Troubleshooting

- If the status indicator is red, use **Refresh drives** and verify the ShareFile mapped drive is mounted.
- Browser preview cannot run sync operations; use the Tauri runtime for actual file copying.
- If the Tauri build fails, confirm the Rust toolchain is installed and available in `PATH`.

## Testing

```powershell
pnpm lint
pnpm test -- --run
pnpm build
pnpm tauri build --debug
```
