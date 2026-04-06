# TeamUpdater V3 — Optimization & Improvement Design

**Date:** 2026-04-06
**Scope:** Code quality, UX, and correctness — Option B (structured refactor + targeted fixes)

---

## Overview

Six independent improvement areas have been identified and approved. Each can be implemented and reviewed separately. There are no breaking changes to user-facing behaviour; the public interface of `useSyncRuntime` is unchanged.

---

## 1. Hook Refactor — Split `useSyncRuntime`

### Problem
`useSyncRuntime.ts` is ~700 lines managing three unrelated concerns: settings state, drive detection state, and sync/preview runtime state. Every future change touches this file regardless of what it actually modifies.

### Solution
Split into three focused hooks, with `useSyncRuntime` becoming a thin coordinator.

**`useSettings`**
- Owns: `settings`, `draftSettings`, `isSaving`
- Actions: `handleFolderToggle`, `handleFirmwareRetentionToggle`, `setSelectedDrive`, `handleResetSettings`, `handleApplySettings`, `persistSettings`
- Input: `folderDefinitions` (from init), `autoSelectedDrive` (from drive detection)
- Output: settings state + mutation actions

**`useDriveDetection`**
- Owns: `driveInfo`, `selectableDrives`, `driveStatus`
- Actions: `refreshDriveDetection`
- Output: drive state + refresh action
- Note: filtered drive list logic (Section 3) lives here

**`useRuntime`**
- Owns: `runState`, `previewPlan`, `runtimePhase`, `runtimeScope`, `runtimeError`, `terminalEntries`, `historyRecords`, `isHistoryLoading`, `isPreviewing`, `previewStatusMessage`, `activeTerminalScope`
- Actions: `handlePreview`, `handleStartSync`, `handleStopPreview`, `handleStopSync`, `handleRetryRuntimeAction`, `handleViewResults`, `navigateToHistory`, `refreshHistory`, `handleQuit`
- Inputs: `settings` (from `useSettings`), `selectedCandidate` (from `useDriveDetection`)
- Contains: Tauri `sync://event` listener, all derived runtime values

**`useSyncRuntime` (coordinator)**
- Calls all three sub-hooks
- Computes cross-cutting derived values: `canStartSync`, `hasUnsavedChanges`
- Returns the combined `SyncRuntimeState & SyncRuntimeActions` surface — unchanged from today

### Files affected
- `src/hooks/useSyncRuntime.ts` — becomes coordinator (~60 lines)
- `src/hooks/useSettings.ts` — new
- `src/hooks/useDriveDetection.ts` — new
- `src/hooks/useRuntime.ts` — new
- `src/hooks/useSyncRuntime.test.ts` — update imports/mocks as needed

---

## 2. Panel State Co-location

### Problem
`App.tsx` holds 8 boolean open/close states for panels that visually and logically belong to child views. This inflates `App.tsx` and forces unnecessary prop drilling.

### Solution
Move panel toggle state into the views that own it as `useState` locals.

| State variables | Move to |
|---|---|
| `isTransferFeedOpen`, `isCleanupFeedOpen`, `isHomeTerminalOpen` | `HomeView` |
| `isPreviewSummaryOpen`, `isPreviewTerminalOpen`, `isPreviewCopiesOpen`, `isPreviewDeletesOpen`, `isPreviewSkippedOpen` | `PreviewView` |

`App.tsx` no longer passes these props or their toggle callbacks. `HomeView` and `PreviewView` manage their own toggle state. Initial values are preserved (`isPreviewSummaryOpen = true`, `isPreviewCopiesOpen = true`, others `false`).

### Files affected
- `src/App.tsx` — remove 8 state declarations, remove ~16 props from view calls
- `src/views/HomeView.tsx` — add 3 local `useState` calls, remove from props interface
- `src/views/PreviewView.tsx` — add 5 local `useState` calls, remove from props interface

---

## 3. Drive Dropdown UX

### Problem
The drive selector shows all 26 letters (A–Z). Most appear as `manual` (unreachable), making the dropdown cluttered and confusing.

### Solution
Filter `selectableDrives` inside `useDriveDetection` to only include:
1. Drives detected as reachable by `detectShareFileDrives`
2. The currently selected drive letter (if not already in the detected list), so a persisted selection is never silently dropped

If the filtered list is empty, the select renders a single disabled placeholder option: `"No drives detected — click Refresh"`.

Replace the current `Array.from({ length: 26 }, ...)` approach entirely.

### Files affected
- `src/hooks/useDriveDetection.ts` — filtered list logic (post-split)
- `src/App.tsx` — add empty-state option to the `<select>` element

---

## 4. Correctness Fixes

### 4a. Cap `transferLog` and `deletionLog`
**Problem:** These arrays in `SyncRunState` grow without bound. Terminal entries are already capped at 400; the logs are not.

**Fix:** In `reduceSyncEvent` (`src/lib/runtime.ts`), apply `.slice(-400)` when appending to `transferLog` (on `file_copied`) and `deletionLog` (on `file_deleted`). Mirrors how `appendTerminalEntry` works today.

### 4b. Collapse duplicate history refresh
**Problem:** `useSyncRuntime` contains both `refreshHistory` (public) and `refreshHistoryFromRuntime` (private), which are functionally identical.

**Fix:** Remove `refreshHistoryFromRuntime`. Use `refreshHistory` everywhere, including after run-completion events. The only difference was the private version omitted setting `isHistoryLoading = true` — this is safe to drop as the flag is idempotent.

### 4c. Remove settings save side-effect from `handleStartSync`
**Problem:** `handleStartSync` calls `saveSettings` before starting the sync. A save failure silently blocks the sync, and the user did not request a save.

**Fix:** Remove the `saveSettings` call from `handleStartSync`. Settings are already persisted when the user explicitly clicks Apply. The sync reads `draftSettings` directly as it does today.

### 4d. Fix `getScopedTerminalEntries` double-filter
**Problem:** The function filters entries by `activeTerminalScope`, then filters again by `scope`. The two filters are redundant — the first already excludes everything the second would exclude.

**Fix:** Simplify to a single `.filter((entry) => entry.scope === scope)`. Remove the `activeTerminalScope` parameter; callers no longer pass it.

**Note:** `activeTerminalScope` may still be needed elsewhere in `useRuntime` for other logic — confirm during implementation and remove only if unused after the simplification.

### Files affected
- `src/lib/runtime.ts` — fixes 4a and 4d
- `src/hooks/useRuntime.ts` (post-split) — fixes 4b and 4c

---

## 5. Rust Cleanup

### 5a. Remove dead `preview_sync_plan` command
**Problem:** `app.rs` exposes `preview_sync_plan` and registers it in the invoke handler. The frontend uses the event-based `start_preview` instead and never calls this command.

**Fix:** Remove the `preview_sync_plan` command, its registration in `invoke_handler`, and the standalone `preview_sync` function in `sync_engine.rs` that it wraps.

### 5b. Merge redundant stop commands
**Problem:** `request_preview_stop` and `request_sync_stop` are identical — both call `coordinator.request_stop()`.

**Fix:** Remove `request_preview_stop`. Keep `request_sync_stop` (rename to `request_stop` for clarity). Update the Tauri registration and the frontend `desktop.ts` to call the single command for both preview and sync stop actions.

### 5c. Make destination root configurable
**Problem:** `DESTINATION_ROOT` is hardcoded as `r"C:\"` in `sync_engine.rs`, with no way to change it without recompiling.

**Fix:**
- Add `destination_root: Option<String>` to `AppSettings` in `models.rs`. When `None`, the engine defaults to `C:\`.
- Add the matching optional field to the TypeScript `AppSettings` type in `types.ts` and `buildDefaultSettings` in `settings.ts` (defaults to `undefined`/`null`).
- No UI is added for this field in this pass — it is a foundation for future configurability.

### Files affected
- `src-tauri/src/app.rs` — remove command, update registration
- `src-tauri/src/sync_engine.rs` — remove `preview_sync`, remove `DESTINATION_ROOT` constant, read from settings
- `src-tauri/src/models.rs` — add `destination_root` field
- `src/lib/desktop.ts` — update stop call
- `src/types.ts` — add optional `destinationRoot` field
- `src/lib/settings.ts` — add field to `buildDefaultSettings` and `mergeSettings`

---

## 6. Folder Definitions — Single Source of Truth

### Problem
The 13 folder definitions (key + mandatory flag) are duplicated in `src/lib/settings.ts` (TypeScript) and `src-tauri/src/models.rs` (Rust). They must be kept in sync manually.

### Solution
Add a `get_folder_definitions` Tauri command to `app.rs` that returns `FOLDER_DEFINITIONS` as `Vec<{ key: String, is_mandatory: bool }>`. The frontend fetches this once during app init inside the existing `Promise.all` in `useRuntime`.

`getFolderDefinitions()` in `settings.ts` is removed. The result is stored in state and passed to `useSettings` as an argument. All downstream consumers (`FolderSelectionView`, `buildDefaultSettings`, `mergeSettings`, `areSettingsEqual`) receive `folderDefinitions` as a parameter instead of importing the module-level constant.

The `FolderDefinition` type in `types.ts` already has the right shape — no new types needed.

### Files affected
- `src-tauri/src/app.rs` — add `get_folder_definitions` command and registration
- `src-tauri/src/models.rs` — expose `FolderDefinition` struct (already used implicitly)
- `src/lib/settings.ts` — remove hardcoded array, update function signatures to accept `folderDefinitions` param
- `src/hooks/useRuntime.ts` — fetch folder definitions on init, pass to `useSettings`
- `src/types.ts` — no change needed

---

## Implementation Order

The sections are independent but this order minimises merge friction:

1. **Section 4d** — fix `getScopedTerminalEntries` (pure utility, no dependencies)
2. **Section 4a** — cap log arrays (pure utility, no dependencies)
3. **Section 1** — hook split (establishes the new file structure)
4. **Section 2** — panel state co-location (depends on split being done)
5. **Section 3** — drive dropdown UX (depends on `useDriveDetection` existing)
6. **Section 4b + 4c** — history dedup + remove save side-effect (within `useRuntime`)
7. **Section 5** — Rust cleanup (independent of frontend work)
8. **Section 6** — folder definitions (touches both frontend and backend)

---

## Out of Scope

- Sync confirmation modal (deferred — UX pattern needs its own design pass)
- Auto-refresh drive detection on window focus (deferred — minor, can be a follow-up)
- Destination root UI (field added to settings model only; no UI in this pass)
- New test coverage (existing tests should continue to pass; new tests are at implementer discretion)
