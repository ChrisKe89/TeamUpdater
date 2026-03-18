# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Preview planning so operators can inspect pending copies, deletes, and firmware-retained files before running a sync.
- Persistent local run history with recorded status, summary counts, and recent file actions.
- Rust unit tests for the sync planner and CI coverage for `cargo test`.

### Changed
- Refactored the sync engine so preview planning and execution share the same file comparison logic.
- Expanded the desktop UI with Preview and History views.
- Hardened the bootstrap installer script for copy-based upgrades, rollback, optional relaunch suppression, and silent NSIS installer execution.

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
