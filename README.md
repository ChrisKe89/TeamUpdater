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
- Visual Studio 2022 Build Tools with the `Desktop development with C++` workload
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

- `src/`: React UI shell, extracted view modules, shared panel components, runtime hook, helper logic, and tests.
- `src-tauri/src/`: Rust commands for settings persistence, drive detection, sync planning, execution, and run history recording.
- `bootstrap/`: Deployment script for copying a packaged build into `C:\CUSPAPPS\TeamUpdaterV3\`.

## Frontend and backend flow

- `src/App.tsx` is now a lightweight shell that renders navigation, the top bar, and the active operator view.
- `src/hooks/useSyncRuntime.ts` owns runtime initialization, Tauri event subscription, preview/sync state transitions, terminal state, and history refresh triggers.
- `src/views/` contains the Home, Preview, History, Folder Selection, and Firmware Retention screens.
- `src/components/` contains reusable cards, collapsible sections, terminal panels, nav items, and empty states.
- `src/lib/runtime.ts` and `src/lib/settings.ts` contain pure selectors, reducers, and settings helpers used by the UI.
- `src-tauri/src/sync_engine.rs` remains the source of truth for preview planning, execution, cancellation, and run summaries.

See [architecture notes](docs/architecture.md) for the current module split and event flow.

## Configuration

Settings are stored as JSON in the user config directory:

- `%APPDATA%\TeamUpdaterV3\settings.json` on Windows systems using the standard config location.

Stored settings include:

- Selected drive letter
- Enabled folder switches
- Firmware retention flag

Run history is stored separately in the local app data directory:

- `%LOCALAPPDATA%\TeamUpdaterV3\run-history.json`

Desktop session logs are written beside the packaged executable:

- `Logs\YYYY-MM-DD_HH-MM-SS_logs.txt`

For the standard bootstrap install, that means:

- `C:\CUSPAPPS\TeamUpdaterV3\Logs\`

## Packaging and deployment

1. Build the Tauri app with `pnpm tauri build`.
1. Run the bootstrap script from `bootstrap/Install-TeamUpdaterV3.ps1`.
1. Point `-BundleSource` at either:
   - the unpacked application directory or executable for copy-based install/upgrade to `C:\CUSPAPPS\TeamUpdaterV3\`
   - the generated NSIS setup executable to run a silent installer flow
1. Use `-CreateDesktopShortcut` to add a shortcut during copy-based deployment.
1. Use `-NoLaunch` to suppress automatic startup after installation.

## Troubleshooting

- If the status indicator is red, use **Refresh drives** and verify the ShareFile mapped drive is mounted.
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
pnpm test:coverage
cd src-tauri; cargo test
pnpm build
pnpm tauri build --debug
```

Current frontend coverage is reported through Vitest V8 coverage. The current baseline after the refactor is approximately:

- Statements: 51%
- Branches: 53%
- Functions: 65%
- Lines: 51%

This is a reporting baseline, not the final target. Coverage should continue to increase as runtime and view behavior is exercised more directly.
