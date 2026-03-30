# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Preview planning so operators can inspect pending copies, deletes, and firmware-retained files before running a sync.
- Persistent local run history with recorded status, summary counts, and recent file actions.
- Rust unit tests for the sync planner and CI coverage for `cargo test`.
- Added a Windows Tauri toolchain preflight script so recurring `link.exe` failures can be diagnosed before starting the desktop app.
- Added per-session desktop log files under `Logs\` beside the packaged executable, including backend sync traces plus frontend window error and unhandled rejection logging.
- Added a dedicated runtime hook, extracted screen-level React views, shared panel components, and architecture notes documenting the frontend/backend split.
- Added frontend tests for runtime helpers, shared panels, the runtime hook, and extracted views.
- Added a `pnpm test:coverage` workflow with Vitest V8 coverage reporting.

### Changed
- Refactored the sync engine so preview planning and execution share the same file comparison logic.
- Expanded the desktop UI with Preview and History views.
- Standardized the desktop UI around a fixed spacing/radius/button system, rebuilt the Home progress module, and tightened Preview panel hierarchy, collapse controls, and empty states.
- Tightened the desktop UI density by removing duplicate runtime status in Home, shrinking preview KPI cards, compressing list rows, aligning preview header actions, and demoting the sidebar Quit control.
- Hardened the bootstrap installer script for copy-based upgrades, rollback, optional relaunch suppression, and silent NSIS installer execution.
- Improved the Tauri toolchain doctor to detect Visual Studio Build Tools from both standard install roots and distinguish a missing MSVC linker payload from an uninitialized developer shell.
- Documented the Visual Studio Build Tools requirement and the `pnpm doctor:tauri` workflow in the README and contributing guide.
- Added the exact `VsDevCmd.bat -arch=x64 -host_arch=x64` recovery command to the Windows setup and troubleshooting docs for uninitialized PowerShell sessions.
- Reworked the React app so `App.tsx` is a shell over `useSyncRuntime`, extracted Home/Preview/History/Folder Selection/Firmware Retention views, and centralized runtime selectors away from JSX.
- Refactored the Rust sync engine into clearer helper boundaries for run finalization, plan building, stale-file handling, and copy/delete execution without changing the Tauri contract.

## [0.1.0] - 2026-03-17

### Fixed
- Added a square Tauri app icon source and generated bundle icon assets so Windows debug builds package successfully.
- Documented the Windows Rust `PATH` requirement for resolving `cargo metadata` failures during Tauri builds.
- Removed the unused ShareFile drive detection error path so Rust builds no longer emit a dead-code warning for `DetectionError::ReadDrives`.

### Added
- Initial Tauri + React implementation for ShareFile drive detection, persistent settings, and folder mirroring.
- Modern desktop UI with live progress, transfer logs, folder toggles, and firmware retention controls.
- Bootstrap installation script for placing the packaged app in `C:\CUSPAPPS\TeamUpdaterV3\` and optionally creating a desktop shortcut.
- Frontend tests, repo standards files, and GitHub Actions CI definitions.
