# TeamUpdater V3 Architecture

TeamUpdater V3 keeps a strict split between desktop execution and operator UI.

## Frontend

- `src/App.tsx` is the application shell for navigation, top-level banners, and active-view selection.
- `src/hooks/useSyncRuntime.ts` owns runtime initialization and sync lifecycle wiring:
  - settings load/save
  - drive detection
  - Tauri event subscription
  - preview/update runtime state
  - terminal output
  - history refresh after terminal states
- `src/views/` holds screen-level components:
  - `HomeView`
  - `PreviewView`
  - `HistoryView`
  - `FolderSelectionView`
  - `FirmwareRetentionView`
- `src/components/app-panels.tsx` contains reusable operator-console primitives such as stat cards, plan panels, terminal panels, and empty states.
- `src/lib/runtime.ts` and `src/lib/settings.ts` contain pure helpers so display logic and reducers stay out of React components.

## Backend

- `src-tauri/src/app.rs` exposes the desktop commands used by the frontend.
- `src-tauri/src/sync_engine.rs` owns:
  - preview plan generation
  - sync execution
  - cancellation checks
  - progress and terminal event emission
  - run history finalization
- The Rust backend remains the source of truth for filesystem behavior. The React app should only derive presentation state from typed backend events and persisted settings.

## Event flow

1. The frontend loads persisted settings, drive candidates, and run history.
2. Preview or update commands are invoked through Tauri.
3. Rust emits `sync://event` payloads for preview progress, run progress, terminal lines, completion, stop, or failure.
4. `useSyncRuntime` reduces those events into UI-facing runtime state.
5. Views render the current operator state without owning sync logic.
