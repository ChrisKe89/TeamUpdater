# Architecture

## Frontend

- React single-window operator UI
- Tauri event listener for live sync telemetry
- Browser fallback for non-desktop preview and local settings storage

## Backend

- Rust commands exposed through Tauri:
  - drive detection
  - settings load/save
  - sync start
  - sync stop
- File sync walks each enabled folder, copies new or changed files, and removes stale local files unless firmware retention blocks the delete.

## Deployment

- Tauri packages the main desktop app.
- `bootstrap/Install-TeamUpdaterV3.ps1` copies the packaged app into `C:\CUSPAPPS\TeamUpdaterV3\` and can create a desktop shortcut.
