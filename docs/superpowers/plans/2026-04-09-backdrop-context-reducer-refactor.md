# Backdrop / Context / Reducer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the WebView2 startup rendering failure caused by `backdrop-filter`, eliminate prop drilling via React context, and make runtime state transitions atomic via `useReducer`.

**Architecture:** A new `SyncRuntimeContext` wraps the existing `useSyncRuntime()` hook so every view consumes state directly instead of receiving 20+ props. Runtime phase/scope/error/preview state collapses into a single `useReducer` in `useRuntime`, with all transitions driven by backend events. CSS `backdrop-filter` is removed from the three elements visible at startup.

**Tech Stack:** React 18, TypeScript, Vite, Tauri (WebView2), Vitest

---

## File Map

| Action | File | Purpose |
|---|---|---|
| Modify | `src/App.css` | Remove backdrop-filter from `.sidebar`, `.panel`, `.topbar`; make surface vars opaque |
| Create | `src/lib/errors.ts` | Single `getErrorMessage` utility |
| Create | `src/lib/errors.test.ts` | Unit tests for `getErrorMessage` |
| Create | `src/lib/runtime-reducer.ts` | `RuntimeReducerState`, `RuntimeAction`, `initialRuntimeState`, `runtimeReducer` |
| Create | `src/lib/runtime-reducer.test.ts` | Unit tests for the reducer |
| Modify | `src/hooks/useRuntime.ts` | Replace 8 `useState` calls with `useReducer(runtimeReducer, ...)` |
| Modify | `src/hooks/useSettings.ts` | Import `getErrorMessage` from lib instead of local copy |
| Modify | `src/hooks/useSyncRuntime.ts` | Import `getErrorMessage` from lib instead of local copy |
| Create | `src/context/SyncRuntimeContext.tsx` | `SyncRuntimeProvider` + `useSyncRuntimeContext()` hook |
| Modify | `src/views/HomeView.tsx` | Remove all props, consume context, absorb topbar |
| Modify | `src/views/PreviewView.tsx` | Remove all props, consume context |
| Modify | `src/views/HistoryView.tsx` | Remove all props, consume context |
| Modify | `src/views/FolderSelectionView.tsx` | Remove all props, consume context |
| Modify | `src/views/FirmwareRetentionView.tsx` | Remove all props, consume context |
| Modify | `src/App.tsx` | Wrap with `SyncRuntimeProvider`, render views with no props, remove topbar block |

---

## Task 1: Remove backdrop-filter from CSS

**Files:**
- Modify: `src/App.css`

The elements visible at startup that have `backdrop-filter` are `.sidebar` (blur 18px), `.topbar` (blur 14px), and `.panel` (blur 14px). The terminal panel already has `backdrop-filter: none`. Remove it from all three startup-visible elements and make the surface CSS variables fully opaque so the visual appearance is preserved.

- [ ] **Step 1: Update CSS**

In `src/App.css`, make the following targeted edits:

**Edit 1 — surface variables (make fully opaque):**
```css
/* Find and replace these three variable lines in :root */
--surface-1: rgb(8, 17, 30);
--surface-2: rgb(13, 25, 42);
--surface-3: rgb(18, 33, 54);
```

**Edit 2 — `.sidebar` (remove blur, make slightly more opaque):**
```css
.sidebar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-5);
  position: sticky;
  top: 0;
  align-self: start;
  height: 100vh;
  padding: var(--space-5);
  border-right: 1px solid var(--border-subtle);
  background: rgb(9, 19, 33);
}
```

**Edit 3 — `.topbar` (remove blur):**
```css
.topbar {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: var(--panel-radius);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
}
```

**Edit 4 — `.panel` (remove blur):**
```css
.panel {
  padding: var(--panel-padding);
  border-radius: var(--panel-radius);
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  box-shadow: 0 24px 48px rgba(2, 7, 18, 0.28);
}
```

- [ ] **Step 2: Verify visually**

Run `npm run tauri dev` and confirm:
- App renders on startup (no blue-BG-only failure)
- Sidebar, topbar, and panels are all visibly styled (dark panels, readable text)
- Terminal panel still has its near-opaque dark background (`rgba(8, 15, 26, 0.98)`)

- [ ] **Step 3: Commit**

```bash
git add src/App.css
git commit -m "fix: remove backdrop-filter from sidebar, panel, topbar to fix WebView2 startup rendering"
```

---

## Task 2: Extract `getErrorMessage` to `src/lib/errors.ts`

**Files:**
- Create: `src/lib/errors.ts`
- Create: `src/lib/errors.test.ts`
- Modify: `src/hooks/useRuntime.ts` (remove local copy, add import)
- Modify: `src/hooks/useSyncRuntime.ts` (remove local copy, add import)
- Modify: `src/hooks/useSettings.ts` (remove local copy, add import)

- [ ] **Step 1: Write the failing test**

Create `src/lib/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { getErrorMessage } from './errors'

describe('getErrorMessage', () => {
  it('extracts message from Error instance', () => {
    expect(getErrorMessage(new Error('boom'), 'fallback')).toBe('boom')
  })

  it('returns string errors directly', () => {
    expect(getErrorMessage('raw string', 'fallback')).toBe('raw string')
  })

  it('returns fallback for non-string non-Error values', () => {
    expect(getErrorMessage(42, 'fallback')).toBe('fallback')
    expect(getErrorMessage(null, 'fallback')).toBe('fallback')
    expect(getErrorMessage(undefined, 'fallback')).toBe('fallback')
    expect(getErrorMessage({}, 'fallback')).toBe('fallback')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/errors.test.ts
```
Expected: FAIL — `Cannot find module './errors'`

- [ ] **Step 3: Create the implementation**

Create `src/lib/errors.ts`:

```ts
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/errors.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Remove local copies and import from lib**

In `src/hooks/useRuntime.ts`, find and remove the function at the bottom:
```ts
// DELETE this entire function:
function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
```
Add import at top: `import { getErrorMessage } from '../lib/errors'`

In `src/hooks/useSyncRuntime.ts`, find and remove:
```ts
// DELETE this entire function:
function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
```
Add import at top: `import { getErrorMessage } from '../lib/errors'`

In `src/hooks/useSettings.ts`, find and remove:
```ts
// DELETE this entire function:
function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
```
Add import at top: `import { getErrorMessage } from '../lib/errors'`

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```
Expected: All tests pass (no compilation or runtime errors)

- [ ] **Step 7: Commit**

```bash
git add src/lib/errors.ts src/lib/errors.test.ts src/hooks/useRuntime.ts src/hooks/useSyncRuntime.ts src/hooks/useSettings.ts
git commit -m "refactor: extract getErrorMessage to lib/errors, remove three local copies"
```

---

## Task 3: Create `src/lib/runtime-reducer.ts` with tests

**Files:**
- Create: `src/lib/runtime-reducer.ts`
- Create: `src/lib/runtime-reducer.test.ts`

This file defines all the runtime UI state that currently lives as 8+ `useState` calls in `useRuntime`. The reducer handles all `SyncEvent` variants plus local UI actions (`PREVIEW_INITIATED`, `SYNC_INITIATED`, etc.) atomically.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/runtime-reducer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { initialRuntimeState, runtimeReducer } from './runtime-reducer'
import type { RuntimeAction } from './runtime-reducer'

describe('runtimeReducer', () => {
  it('starts in initializing state', () => {
    expect(initialRuntimeState.isInitializing).toBe(true)
    expect(initialRuntimeState.phase).toBe('idle')
    expect(initialRuntimeState.scope).toBe(null)
  })

  it('INIT_COMPLETE clears loading flags and stores history', () => {
    const records = [{ id: '1' } as any]
    const next = runtimeReducer(initialRuntimeState, { type: 'INIT_COMPLETE', records })
    expect(next.isInitializing).toBe(false)
    expect(next.isHistoryLoading).toBe(false)
    expect(next.historyRecords).toBe(records)
  })

  it('INIT_FAILED clears loading flags', () => {
    const next = runtimeReducer(initialRuntimeState, { type: 'INIT_FAILED' })
    expect(next.isInitializing).toBe(false)
    expect(next.isHistoryLoading).toBe(false)
  })

  it('PREVIEW_INITIATED sets running state and navigates to preview', () => {
    const next = runtimeReducer(initialRuntimeState, { type: 'PREVIEW_INITIATED' })
    expect(next.phase).toBe('running')
    expect(next.scope).toBe('preview')
    expect(next.isPreviewing).toBe(true)
    expect(next.terminalEntries).toEqual([])
    expect(next.previewPlan).toBeNull()
    expect(next.activeView).toBe('preview')
    expect(next.error).toBeNull()
  })

  it('SYNC_INITIATED sets running state and navigates to home', () => {
    const next = runtimeReducer(initialRuntimeState, { type: 'SYNC_INITIATED' })
    expect(next.phase).toBe('running')
    expect(next.scope).toBe('sync')
    expect(next.runState.isRunning).toBe(true)
    expect(next.terminalEntries).toEqual([])
    expect(next.activeView).toBe('home')
    expect(next.error).toBeNull()
  })

  it('SYNC_EVENT preview_started updates preview state atomically', () => {
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'preview_started', message: 'Building plan...' },
    })
    expect(next.phase).toBe('running')
    expect(next.scope).toBe('preview')
    expect(next.isPreviewing).toBe(true)
    expect(next.previewStatusMessage).toBe('Building plan...')
    expect(next.terminalEntries).toEqual([])
    expect(next.error).toBeNull()
  })

  it('SYNC_EVENT preview_completed resolves to preview-ready and stores plan', () => {
    const plan = { actions: [], summary: {} } as any
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'preview_completed', plan, message: 'Done.' },
    })
    expect(next.phase).toBe('preview-ready')
    expect(next.isPreviewing).toBe(false)
    expect(next.previewPlan).toBe(plan)
    expect(next.activeView).toBe('preview')
  })

  it('SYNC_EVENT preview_failed sets error state', () => {
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'preview_failed', message: 'Network error' },
    })
    expect(next.phase).toBe('error')
    expect(next.scope).toBe('preview')
    expect(next.error).toBe('Network error')
    expect(next.isPreviewing).toBe(false)
  })

  it('SYNC_EVENT run_completed transitions to completed', () => {
    const summary = { copiedFiles: 3 } as any
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'run_completed', summary, message: 'Done.' },
    })
    expect(next.phase).toBe('completed')
    expect(next.scope).toBe('sync')
    expect(next.error).toBeNull()
  })

  it('SYNC_EVENT run_failed sets error state', () => {
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'run_failed', message: 'Disk full' },
    })
    expect(next.phase).toBe('error')
    expect(next.scope).toBe('sync')
    expect(next.error).toBe('Disk full')
  })

  it('SYNC_EVENT log_line appends a terminal entry', () => {
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'log_line', scope: 'sync', line: 'Copying file.txt' },
    })
    expect(next.terminalEntries).toHaveLength(1)
    expect(next.terminalEntries[0].line).toBe('Copying file.txt')
  })

  it('HISTORY_LOADING / HISTORY_LOADED round-trip', () => {
    const loading = runtimeReducer(initialRuntimeState, { type: 'HISTORY_LOADING' })
    expect(loading.isHistoryLoading).toBe(true)

    const records = [{ id: '2' } as any]
    const loaded = runtimeReducer(loading, { type: 'HISTORY_LOADED', records })
    expect(loaded.isHistoryLoading).toBe(false)
    expect(loaded.historyRecords).toBe(records)
  })

  it('SET_ACTIVE_VIEW changes only the active view', () => {
    const next = runtimeReducer(initialRuntimeState, { type: 'SET_ACTIVE_VIEW', view: 'history' })
    expect(next.activeView).toBe('history')
    expect(next.phase).toBe(initialRuntimeState.phase)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/lib/runtime-reducer.test.ts
```
Expected: FAIL — `Cannot find module './runtime-reducer'`

- [ ] **Step 3: Create the implementation**

Create `src/lib/runtime-reducer.ts`:

```ts
import { appendTerminalEntry, initialRunState, reduceSyncEvent } from './runtime'
import type { RuntimePhase, RuntimeScope } from './runtime'
import type { NavView, RunAuditRecord, SyncEvent, SyncPlan, SyncRunState, TerminalEntry } from '../types'

export interface RuntimeReducerState {
  phase: RuntimePhase
  scope: RuntimeScope
  error: string | null
  isPreviewing: boolean
  previewStatusMessage: string
  terminalEntries: TerminalEntry[]
  runState: SyncRunState
  previewPlan: SyncPlan | null
  activeView: NavView
  historyRecords: RunAuditRecord[]
  isInitializing: boolean
  isHistoryLoading: boolean
}

export type RuntimeAction =
  | { type: 'INIT_COMPLETE'; records: RunAuditRecord[] }
  | { type: 'INIT_FAILED' }
  | { type: 'SYNC_EVENT'; payload: SyncEvent }
  | { type: 'PREVIEW_INITIATED' }
  | { type: 'SYNC_INITIATED' }
  | { type: 'HISTORY_LOADING' }
  | { type: 'HISTORY_LOADED'; records: RunAuditRecord[] }
  | { type: 'HISTORY_FAILED' }
  | { type: 'SET_ACTIVE_VIEW'; view: NavView }

export const initialRuntimeState: RuntimeReducerState = {
  phase: 'idle',
  scope: null,
  error: null,
  isPreviewing: false,
  previewStatusMessage: 'Ready to generate a preview.',
  terminalEntries: [],
  runState: initialRunState,
  previewPlan: null,
  activeView: 'home',
  historyRecords: [],
  isInitializing: true,
  isHistoryLoading: true,
}

export function runtimeReducer(
  state: RuntimeReducerState,
  action: RuntimeAction,
): RuntimeReducerState {
  switch (action.type) {
    case 'INIT_COMPLETE':
      return { ...state, isInitializing: false, isHistoryLoading: false, historyRecords: action.records }

    case 'INIT_FAILED':
      return { ...state, isInitializing: false, isHistoryLoading: false }

    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.view }

    case 'HISTORY_LOADING':
      return { ...state, isHistoryLoading: true }

    case 'HISTORY_LOADED':
      return { ...state, isHistoryLoading: false, historyRecords: action.records }

    case 'HISTORY_FAILED':
      return { ...state, isHistoryLoading: false }

    case 'PREVIEW_INITIATED':
      return {
        ...state,
        phase: 'running',
        scope: 'preview',
        error: null,
        isPreviewing: true,
        previewStatusMessage: 'Preview queued.',
        terminalEntries: [],
        previewPlan: null,
        activeView: 'preview',
      }

    case 'SYNC_INITIATED':
      return {
        ...state,
        phase: 'running',
        scope: 'sync',
        error: null,
        previewStatusMessage: 'Ready to generate a preview.',
        terminalEntries: [],
        runState: { ...initialRunState, isRunning: true, lastMessage: 'Sync queued.' },
        activeView: 'home',
      }

    case 'SYNC_EVENT':
      return applySyncEvent(state, action.payload)
  }
}

function applySyncEvent(state: RuntimeReducerState, event: SyncEvent): RuntimeReducerState {
  switch (event.kind) {
    case 'preview_started':
      return {
        ...state,
        isPreviewing: true,
        phase: 'running',
        scope: 'preview',
        error: null,
        previewStatusMessage: event.message,
        terminalEntries: [],
      }

    case 'preview_completed':
      return {
        ...state,
        isPreviewing: false,
        phase: 'preview-ready',
        scope: 'preview',
        error: null,
        previewPlan: event.plan,
        activeView: 'preview',
        previewStatusMessage: event.message,
      }

    case 'preview_stopped':
      return {
        ...state,
        isPreviewing: false,
        phase: 'idle',
        previewStatusMessage: event.message,
      }

    case 'preview_failed':
      return {
        ...state,
        isPreviewing: false,
        phase: 'error',
        scope: 'preview',
        error: event.message,
        previewStatusMessage: event.message,
      }

    case 'log_line':
      return {
        ...state,
        terminalEntries: appendTerminalEntry(state.terminalEntries, event),
      }

    case 'run_started':
      return {
        ...state,
        phase: 'running',
        scope: 'sync',
        error: null,
        terminalEntries: [],
        runState: reduceSyncEvent(state.runState, event),
      }

    case 'run_completed':
    case 'run_stopped':
      return {
        ...state,
        phase: 'completed',
        scope: 'sync',
        error: null,
        runState: reduceSyncEvent(state.runState, event),
      }

    case 'run_failed':
      return {
        ...state,
        phase: 'error',
        scope: 'sync',
        error: event.message,
        runState: reduceSyncEvent(state.runState, event),
      }

    default:
      return { ...state, runState: reduceSyncEvent(state.runState, event) }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/lib/runtime-reducer.test.ts
```
Expected: PASS (all 12 tests)

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/lib/runtime-reducer.ts src/lib/runtime-reducer.test.ts
git commit -m "feat: add runtime-reducer with atomic state transitions and full test coverage"
```

---

## Task 4: Rewrite `useRuntime.ts` to use `useReducer`

**Files:**
- Modify: `src/hooks/useRuntime.ts`

Replace all `useState` calls for runtime phase/scope/error/preview/terminal/runState/previewPlan/activeView/history/isInitializing with a single `useReducer`. The hook's return shape stays identical so `useSyncRuntime` is unaffected.

- [ ] **Step 1: Replace the hook implementation**

Overwrite the contents of `src/hooks/useRuntime.ts` with:

```ts
// src/hooks/useRuntime.ts
import { useCallback, useEffect, useMemo, useRef, useReducer } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  detectShareFileDrives,
  getFolderDefinitions,
  isDesktopRuntime,
  loadRunHistory,
  loadSettings,
  quitApp,
  requestStop,
  startPreview,
  startSync,
  writeClientLog,
} from '../lib/desktop'
import {
  getCleanupFeedItems,
  getHomeCounts,
  getHomePanelClassName,
  getPreviewActions,
  getRuntimeBadgeTone,
  getRuntimeCurrentDetail,
  getRuntimeCurrentTitle,
  getRuntimeHeadline,
  getRuntimeStatusLabel,
  getScopedTerminalEntries,
  getTransferFeedItems,
  type RuntimePhase,
  type RuntimeScope,
} from '../lib/runtime'
import { initialRuntimeState, runtimeReducer } from '../lib/runtime-reducer'
import { getErrorMessage } from '../lib/errors'
import { mergeSettings } from '../lib/settings'
import type {
  AppSettings,
  DetectDrivesResponse,
  DriveCandidate,
  FolderDefinition,
  NavView,
  RunAuditRecord,
  SyncEvent,
  SyncPlan,
  SyncRunState,
  TerminalEntry,
} from '../types'

export interface UseRuntimeOptions {
  draftSettings: AppSettings
  autoSelectedDrive: string | null
  selectedCandidate: DriveCandidate | null
  folderDefinitions: FolderDefinition[]
  onError: (message: string | null) => void
  onNotice: (message: string | null) => void
  hydrateSettings: (loadedSettings: AppSettings, autoSelectedDrive: string | null, folderDefinitions: FolderDefinition[]) => void
  initializeDrives: (detected: DetectDrivesResponse) => void
  onFolderDefinitionsLoaded: (defs: FolderDefinition[]) => void
}

export function useRuntime({
  draftSettings,
  autoSelectedDrive,
  selectedCandidate: _selectedCandidate,
  folderDefinitions,
  onError,
  onNotice,
  hydrateSettings,
  initializeDrives,
  onFolderDefinitionsLoaded,
}: UseRuntimeOptions) {
  const [state, dispatch] = useReducer(runtimeReducer, initialRuntimeState)

  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const onNoticeRef = useRef(onNotice)
  useEffect(() => { onNoticeRef.current = onNotice }, [onNotice])

  const refreshHistory = useCallback(async () => {
    if (!isDesktopRuntime) return
    dispatch({ type: 'HISTORY_LOADING' })
    onErrorRef.current(null)
    try {
      const records = await loadRunHistory()
      dispatch({ type: 'HISTORY_LOADED', records })
    } catch (error) {
      onErrorRef.current(getErrorMessage(error, 'Unable to load run history.'))
      dispatch({ type: 'HISTORY_FAILED' })
    }
  }, [])

  const refreshHistoryRef = useRef(refreshHistory)
  useEffect(() => { refreshHistoryRef.current = refreshHistory }, [refreshHistory])

  const onFolderDefinitionsLoadedRef = useRef(onFolderDefinitionsLoaded)
  useEffect(() => { onFolderDefinitionsLoadedRef.current = onFolderDefinitionsLoaded }, [onFolderDefinitionsLoaded])

  const hydrateSettingsRef = useRef(hydrateSettings)
  useEffect(() => { hydrateSettingsRef.current = hydrateSettings }, [hydrateSettings])

  const initializeDrivesRef = useRef(initializeDrives)
  useEffect(() => { initializeDrivesRef.current = initializeDrives }, [initializeDrives])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const [loadedSettings, detectedDrives, records, loadedFolderDefs] = await Promise.all([
          loadSettings(),
          detectShareFileDrives(),
          loadRunHistory(),
          getFolderDefinitions(),
        ])
        if (cancelled) return
        onFolderDefinitionsLoadedRef.current(loadedFolderDefs)
        hydrateSettingsRef.current(loadedSettings, detectedDrives.autoSelected, loadedFolderDefs)
        initializeDrivesRef.current(detectedDrives)
        dispatch({ type: 'INIT_COMPLETE', records })
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current(getErrorMessage(error, 'Unable to initialise the app.'))
          dispatch({ type: 'INIT_FAILED' })
        }
      }
    }

    const unlistenPromise = isDesktopRuntime
      ? listen<SyncEvent>('sync://event', (event) => {
          if (cancelled) return
          dispatch({ type: 'SYNC_EVENT', payload: event.payload })
          const payload = event.payload
          if (payload.kind === 'preview_failed') onErrorRef.current(payload.message)
          if (payload.kind === 'run_failed') onErrorRef.current(payload.message)
          if (
            payload.kind === 'run_completed' ||
            payload.kind === 'run_stopped' ||
            payload.kind === 'run_failed'
          ) {
            void refreshHistoryRef.current()
          }
        })
      : Promise.resolve(() => undefined)

    void init()

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

  useEffect(() => {
    void writeClientLog(
      'INFO',
      `Runtime state changed: phase=${state.phase}, scope=${state.scope ?? 'none'}`,
    )
  }, [state.phase, state.scope])

  // Derived values
  const syncTerminalEntries = useMemo(
    () => getScopedTerminalEntries(state.terminalEntries, 'sync'),
    [state.terminalEntries],
  )
  const previewTerminalEntries = useMemo(
    () => getScopedTerminalEntries(state.terminalEntries, 'preview'),
    [state.terminalEntries],
  )
  const transferFeedItems = useMemo(
    () => getTransferFeedItems(state.runState.transferLog, syncTerminalEntries),
    [state.runState.transferLog, syncTerminalEntries],
  )
  const cleanupFeedItems = useMemo(
    () => getCleanupFeedItems(state.runState.deletionLog, syncTerminalEntries),
    [state.runState.deletionLog, syncTerminalEntries],
  )
  const previewActions = useMemo(() => getPreviewActions(state.previewPlan), [state.previewPlan])
  const previewCopyDetail = state.previewPlan
    ? `${state.previewPlan.summary.totalCopyBytesLabel} to copy`
    : undefined
  const plannedCopyCount =
    state.previewPlan?.summary.copyCount ?? state.runState.summary?.plannedCopyFiles ?? 0
  const plannedDeleteCount =
    state.previewPlan?.summary.deleteCount ?? state.runState.summary?.plannedDeleteFiles ?? 0
  const processedCount = state.runState.copiedCount + state.runState.deletedCount
  const processedTotal = plannedCopyCount + plannedDeleteCount
  const runtimeStatusLabel = getRuntimeStatusLabel(state.phase, state.scope)
  const runtimeBadgeTone = getRuntimeBadgeTone(state.phase)
  const homeTransferTitle =
    state.runState.currentItem?.displayName ??
    (state.runState.isRunning ? 'Preparing transfer' : 'No active transfer')
  const homeTransferDetail =
    state.runState.currentItem?.sourcePath ??
    (state.runState.isRunning ? state.runState.lastMessage : 'Run preview or update to start a transfer.')
  const runtimeHeadline = getRuntimeHeadline({
    isPreviewing: state.isPreviewing,
    phase: state.phase,
    previewCount: state.previewPlan?.actions.length ?? 0,
    processedCount,
    processedTotal,
    runMessage: state.runState.lastMessage,
    runtimeError: state.error,
  })
  const runtimeCurrentTitle = getRuntimeCurrentTitle({
    homeTransferTitle,
    isPreviewing: state.isPreviewing,
    phase: state.phase,
    previewStatusMessage: state.previewStatusMessage,
    runtimeError: state.error,
  })
  const runtimeCurrentDetail = getRuntimeCurrentDetail({
    homeTransferDetail,
    isPreviewing: state.isPreviewing,
    phase: state.phase,
    previewStatusMessage: state.previewStatusMessage,
    runtimeError: state.error,
  })
  const runtimeCanViewResults = Boolean(state.previewPlan || state.runState.summary)
  const runtimeErrorTitle = state.scope === 'preview' ? 'Preview failed' : 'Update failed'
  const homePanelClassName = getHomePanelClassName(state.phase)
  const enabledFolderCount = useMemo(
    () => Object.values(draftSettings.folders).filter(Boolean).length,
    [draftSettings.folders],
  )
  const homeCounts = useMemo(
    () => getHomeCounts(enabledFolderCount, state.previewPlan, state.runState.summary),
    [enabledFolderCount, state.previewPlan, state.runState.summary],
  )

  // Actions
  const handlePreview = useCallback(async () => {
    if (state.runState.isRunning || state.isPreviewing) return
    onErrorRef.current(null)
    onNoticeRef.current(null)
    dispatch({ type: 'PREVIEW_INITIATED' })
    try {
      await startPreview(mergeSettings(folderDefinitions, draftSettings, autoSelectedDrive))
    } catch (error) {
      dispatch({
        type: 'SYNC_EVENT',
        payload: { kind: 'preview_failed', message: getErrorMessage(error, 'Unable to build the sync preview.') },
      })
    }
  }, [state.runState.isRunning, state.isPreviewing, draftSettings, autoSelectedDrive, folderDefinitions])

  const handleStopPreview = useCallback(async () => {
    try {
      await requestStop()
    } catch (error) {
      onErrorRef.current(getErrorMessage(error, 'Unable to request preview stop.'))
    }
  }, [])

  const handleStartSync = useCallback(async () => {
    if (state.runState.isRunning || state.isPreviewing) return
    onErrorRef.current(null)
    onNoticeRef.current(null)
    dispatch({ type: 'SYNC_INITIATED' })
    try {
      await startSync(mergeSettings(folderDefinitions, draftSettings, autoSelectedDrive))
    } catch (error) {
      dispatch({
        type: 'SYNC_EVENT',
        payload: { kind: 'run_failed', message: getErrorMessage(error, 'Unable to start sync.') },
      })
    }
  }, [state.runState.isRunning, state.isPreviewing, draftSettings, autoSelectedDrive, folderDefinitions])

  const handleStopSync = useCallback(async () => {
    try {
      await requestStop()
    } catch (error) {
      onErrorRef.current(getErrorMessage(error, 'Unable to request stop.'))
    }
  }, [])

  const handleQuit = useCallback(async () => {
    if (state.runState.isRunning || state.isPreviewing) {
      const shouldQuit = window.confirm('A preview or sync is currently running. Quit the app anyway?')
      if (!shouldQuit) return
    }
    try {
      await quitApp()
    } catch (error) {
      onErrorRef.current(getErrorMessage(error, 'Unable to quit.'))
    }
  }, [state.runState.isRunning, state.isPreviewing])

  const handleRetryRuntimeAction = useCallback(async () => {
    if (state.scope === 'preview') {
      await handlePreview()
      return
    }
    await handleStartSync()
  }, [state.scope, handlePreview, handleStartSync])

  const navigateToHistory = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_VIEW', view: 'history' })
    void refreshHistory()
  }, [refreshHistory])

  const handleViewResults = useCallback(() => {
    if (state.previewPlan) {
      dispatch({ type: 'SET_ACTIVE_VIEW', view: 'preview' })
      return
    }
    navigateToHistory()
  }, [state.previewPlan, navigateToHistory])

  const setActiveView = useCallback((view: NavView) => {
    dispatch({ type: 'SET_ACTIVE_VIEW', view })
  }, [])

  return {
    activeView: state.activeView,
    setActiveView,
    runState: state.runState,
    previewPlan: state.previewPlan,
    historyRecords: state.historyRecords,
    isInitializing: state.isInitializing,
    isHistoryLoading: state.isHistoryLoading,
    isPreviewing: state.isPreviewing,
    previewStatusMessage: state.previewStatusMessage,
    runtimePhase: state.phase,
    runtimeScope: state.scope,
    runtimeError: state.error,
    runtimeErrorTitle,
    runtimeCanViewResults,
    syncTerminalEntries,
    previewTerminalEntries,
    transferFeedItems,
    cleanupFeedItems,
    previewActions,
    previewCopyDetail,
    processedCount,
    processedTotal,
    runtimeStatusLabel,
    runtimeBadgeTone,
    runtimeHeadline,
    runtimeCurrentTitle,
    runtimeCurrentDetail,
    homePanelClassName,
    homeCounts,
    enabledFolderCount,
    refreshHistory,
    handlePreview,
    handleStopPreview,
    handleStartSync,
    handleStopSync,
    handleQuit,
    handleRetryRuntimeAction,
    navigateToHistory,
    handleViewResults,
  }
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 3: Smoke test in dev**

```bash
npm run tauri dev
```
Verify: app initialises, preview runs, sync runs, phase transitions work correctly.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useRuntime.ts
git commit -m "refactor: replace 8 useState calls in useRuntime with useReducer, fix optimistic state races"
```

---

## Task 5: Create `SyncRuntimeContext`

**Files:**
- Create: `src/context/SyncRuntimeContext.tsx`

- [ ] **Step 1: Create the context file**

Create `src/context/SyncRuntimeContext.tsx`:

```tsx
import { createContext, useContext, type ReactNode } from 'react'
import { useSyncRuntime, type SyncRuntimeActions, type SyncRuntimeState } from '../hooks/useSyncRuntime'

type SyncRuntimeContextValue = SyncRuntimeState & SyncRuntimeActions

const SyncRuntimeContext = createContext<SyncRuntimeContextValue | null>(null)

export function SyncRuntimeProvider({ children }: { children: ReactNode }) {
  const runtime = useSyncRuntime()
  return <SyncRuntimeContext.Provider value={runtime}>{children}</SyncRuntimeContext.Provider>
}

export function useSyncRuntimeContext(): SyncRuntimeContextValue {
  const ctx = useContext(SyncRuntimeContext)
  if (!ctx) throw new Error('useSyncRuntimeContext must be used within SyncRuntimeProvider')
  return ctx
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```
Expected: All tests pass (this file has no logic to test independently — the hooks it wraps are already tested)

- [ ] **Step 3: Commit**

```bash
git add src/context/SyncRuntimeContext.tsx
git commit -m "feat: add SyncRuntimeContext provider and consumer hook"
```

---

## Task 6: Update views to consume context, move topbar into HomeView

**Files:**
- Modify: `src/views/HomeView.tsx`
- Modify: `src/views/PreviewView.tsx`
- Modify: `src/views/HistoryView.tsx`
- Modify: `src/views/FolderSelectionView.tsx`
- Modify: `src/views/FirmwareRetentionView.tsx`

Each view drops its props interface and calls `useSyncRuntimeContext()` internally. HomeView additionally absorbs the topbar (currently in App.tsx) and uses `runState.copiedCount` / `runState.deletedCount` directly (removing redundant standalone props).

The topbar lives at the Fragment root level in HomeView so it stays a sibling of the view-grid inside `.content`'s grid — no wrapping div needed.

- [ ] **Step 1: Rewrite `HomeView.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { CollapsibleLogPanel, ProgressBar, TerminalPanel } from '../components/app-panels'
import { useSyncRuntimeContext } from '../context/SyncRuntimeContext'
import { formatProgress } from '../lib/runtime'

export function HomeView() {
  const {
    canStartSync,
    cleanupFeedItems,
    draftSettings,
    driveStatus,
    homeCounts,
    homePanelClassName,
    isPreviewing,
    previewStatusMessage,
    processedCount,
    processedTotal,
    refreshDriveDetection,
    runState,
    runtimeBadgeTone,
    runtimeCanViewResults,
    runtimeCurrentDetail,
    runtimeCurrentTitle,
    runtimeError,
    runtimeErrorTitle,
    runtimeHeadline,
    runtimePhase,
    runtimeScope,
    runtimeStatusLabel,
    selectableDrives,
    setSelectedDrive,
    syncTerminalEntries,
    transferFeedItems,
    handlePreview,
    handleRetryRuntimeAction,
    handleStartSync,
    handleStopPreview,
    handleStopSync,
    handleViewResults,
  } = useSyncRuntimeContext()

  const [isConsoleStatusCollapsed, setIsConsoleStatusCollapsed] = useState(false)
  const [isCurrentRunCollapsed, setIsCurrentRunCollapsed] = useState(false)
  const [isHomeTerminalOpen, setIsHomeTerminalOpen] = useState(false)
  const [isTransferFeedOpen, setIsTransferFeedOpen] = useState(false)
  const [isCleanupFeedOpen, setIsCleanupFeedOpen] = useState(false)

  useEffect(() => {
    if (runtimePhase === 'running') setIsCurrentRunCollapsed(false)
  }, [runtimePhase])

  const onStop = runtimeScope === 'preview' ? handleStopPreview : handleStopSync
  const homeTerminalOpen = isHomeTerminalOpen || runtimePhase === 'running'
  const transferFeedOpen = isTransferFeedOpen && transferFeedItems.length > 0
  const cleanupFeedOpen = isCleanupFeedOpen && cleanupFeedItems.length > 0

  return (
    <>
      <header className={`topbar${isConsoleStatusCollapsed ? ' topbar--collapsed' : ''}`}>
        <div>
          <p className="eyebrow">Console Status</p>
          {!isConsoleStatusCollapsed ? (
            <>
              <h2>ShareFile operator console</h2>
              <div className="status-row">
                <span className={`status-pill status-pill--${driveStatus.tone}`}>
                  <span className="status-dot" />
                  {driveStatus.label}
                </span>
                <span className={`status-pill status-pill--${runtimeBadgeTone}`}>
                  <span className="status-dot" />
                  {runtimeStatusLabel}
                </span>
              </div>
            </>
          ) : (
            <div className="status-row">
              <span className={`status-pill status-pill--${driveStatus.tone}`}>
                <span className="status-dot" />
                {driveStatus.label}
              </span>
              <span className={`status-pill status-pill--${runtimeBadgeTone}`}>
                <span className="status-dot" />
                {runtimeStatusLabel}
              </span>
            </div>
          )}
        </div>
        <div className="topbar-actions">
          {!isConsoleStatusCollapsed ? (
            <>
              <label className="field">
                <span>Drive letter</span>
                <select
                  onChange={(event) => setSelectedDrive(event.target.value || null)}
                  value={draftSettings.selectedDrive ?? ''}
                >
                  <option value="">Select drive</option>
                  {selectableDrives.length === 0 ? (
                    <option disabled value="">No drives detected — click Refresh</option>
                  ) : (
                    selectableDrives.map((candidate) => (
                      <option key={candidate.letter} value={candidate.letter}>
                        {candidate.letter}:\\ {candidate.isReachable ? 'reachable' : 'manual'}
                      </option>
                    ))
                  )}
                </select>
              </label>
              <button
                className="secondary-button"
                onClick={() => void refreshDriveDetection()}
                type="button"
              >
                Refresh drives
              </button>
            </>
          ) : null}
          <button
            className="utility-button utility-button--icon"
            onClick={() => setIsConsoleStatusCollapsed((prev) => !prev)}
            title={isConsoleStatusCollapsed ? 'Expand console status' : 'Collapse console status'}
            type="button"
          >
            {isConsoleStatusCollapsed ? '▾' : '▴'}
          </button>
        </div>
      </header>

      <section className="view-grid view-grid--home">
        <section className={homePanelClassName}>
          <div className="progress-module-header">
            <div className="progress-module-copy">
              <span className="section-kicker">Current run</span>
              <h2>{runtimeCurrentTitle}</h2>
              {!isCurrentRunCollapsed ? (
                <>
                  <p className="transfer-path">{runtimeCurrentDetail}</p>
                  <p className="runtime-headline">{runtimeHeadline}</p>
                </>
              ) : null}
            </div>
            <div className="progress-module-end">
              {!isCurrentRunCollapsed ? (
                <div className="progress-module-summary">
                  {runtimePhase === 'error' ? (
                    <div className="runtime-callout runtime-callout--error">
                      <strong>{runtimeErrorTitle}</strong>
                      <span>{runtimeError ?? runState.lastMessage}</span>
                    </div>
                  ) : (
                    <div className="percentage-block">
                      <span>Overall progress</span>
                      <strong>{formatProgress(runState.overallProgress)}%</strong>
                    </div>
                  )}
                </div>
              ) : null}
              <button
                className="utility-button utility-button--icon"
                onClick={() => setIsCurrentRunCollapsed((prev) => !prev)}
                title={isCurrentRunCollapsed ? 'Expand current run' : 'Collapse current run'}
                type="button"
              >
                {isCurrentRunCollapsed ? '▾' : '▴'}
              </button>
            </div>
          </div>

          {!isCurrentRunCollapsed ? (
            <>
              <div className="inline-stats">
                {homeCounts.map((item) => (
                  <div className="inline-stat" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
                <div className="inline-stat inline-stat--runtime">
                  <span>Processed</span>
                  <strong>{processedCount.toString()}</strong>
                  <small>
                    {processedTotal > 0
                      ? `${processedCount} / ${processedTotal} files`
                      : 'Awaiting planner totals'}
                  </small>
                </div>
                <div className="inline-stat inline-stat--runtime">
                  <span>Errors</span>
                  <strong>{runtimePhase === 'error' ? '1' : '0'}</strong>
                  <small>{runtimePhase === 'error' ? 'Run needs action' : 'No active failures'}</small>
                </div>
              </div>

              <div className="progress-stack">
                <ProgressBar
                  detail={
                    runtimeScope === 'preview'
                      ? previewStatusMessage
                      : `${formatProgress(runState.itemProgress)}% complete`
                  }
                  label="Current file"
                  progressLabel={
                    runtimeScope === 'preview'
                      ? isPreviewing
                        ? 'Working'
                        : 'Ready'
                      : `${formatProgress(runState.itemProgress)}%`
                  }
                  value={runState.itemProgress}
                />
                <ProgressBar
                  detail={
                    processedTotal > 0
                      ? `${processedCount} / ${processedTotal} files`
                      : 'Waiting for transfer totals'
                  }
                  label="Overall queue"
                  progressLabel={
                    processedTotal > 0
                      ? `${processedCount} / ${processedTotal}`
                      : `${formatProgress(runState.overallProgress)}%`
                  }
                  value={runState.overallProgress}
                />
              </div>

              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!canStartSync || runtimePhase === 'running'}
                  onClick={() => void handlePreview()}
                  type="button"
                >
                  {isPreviewing
                    ? 'Running preview...'
                    : runtimePhase === 'completed'
                      ? 'Run preview again'
                      : 'Run preview'}
                </button>
                <button
                  className="primary-button"
                  disabled={!canStartSync || runtimePhase === 'running'}
                  onClick={() => void handleStartSync()}
                  type="button"
                >
                  {runtimePhase === 'completed' ? 'Run update again' : 'Run update'}
                </button>
                {runtimePhase === 'running' ? (
                  <button
                    className="utility-button utility-button--danger utility-button--strong"
                    onClick={() => void onStop()}
                    type="button"
                  >
                    Stop
                  </button>
                ) : null}
                {runtimePhase === 'error' ? (
                  <>
                    <button
                      className="utility-button utility-button--danger utility-button--strong"
                      onClick={() => void handleRetryRuntimeAction()}
                      type="button"
                    >
                      Retry
                    </button>
                    <button
                      className="utility-button"
                      onClick={() => setIsHomeTerminalOpen(true)}
                      type="button"
                    >
                      View logs
                    </button>
                  </>
                ) : null}
                {runtimePhase === 'completed' && runtimeCanViewResults ? (
                  <button className="utility-button" onClick={handleViewResults} type="button">
                    View results
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </section>

        <TerminalPanel
          entries={syncTerminalEntries}
          isCollapsible
          isOpen={homeTerminalOpen}
          onCancel={runState.isRunning ? () => void onStop() : undefined}
          onToggle={() => setIsHomeTerminalOpen((previous) => !previous)}
          status={runState.lastMessage}
          title="Execution terminal"
        />

        <CollapsibleLogPanel
          count={Math.max(runState.copiedCount, transferFeedItems.length)}
          emptyDetail="Run preview or update to populate this list."
          emptyTitle="No files copied yet"
          eyebrow="Transfer Feed"
          isOpen={transferFeedOpen}
          items={transferFeedItems}
          onToggle={() => setIsTransferFeedOpen((previous) => !previous)}
          title="New files"
        />

        <CollapsibleLogPanel
          count={Math.max(runState.deletedCount, cleanupFeedItems.length)}
          emptyDetail="Cleanup activity will appear here during update runs."
          emptyTitle="No files removed yet"
          eyebrow="Cleanup Feed"
          isOpen={cleanupFeedOpen}
          items={cleanupFeedItems}
          onToggle={() => setIsCleanupFeedOpen((previous) => !previous)}
          title="Removed files"
        />
      </section>
    </>
  )
}
```

- [ ] **Step 2: Rewrite `PreviewView.tsx`**

```tsx
import { useState } from 'react'
import {
  CollapseButton,
  EmptyState,
  PlanPanel,
  StatCard,
  TerminalPanel,
} from '../components/app-panels'
import { useSyncRuntimeContext } from '../context/SyncRuntimeContext'
import { formatTimestamp } from '../lib/runtime'

export function PreviewView() {
  const {
    canStartSync,
    isPreviewing,
    previewActions,
    previewCopyDetail,
    previewPlan,
    previewStatusMessage,
    previewTerminalEntries,
    runtimeBadgeTone,
    runtimePhase,
    runtimeScope,
    runtimeStatusLabel,
    handlePreview,
    handleRetryRuntimeAction,
    handleStartSync,
    handleStopPreview,
  } = useSyncRuntimeContext()

  const [isPreviewSummaryOpen, setIsPreviewSummaryOpen] = useState(true)
  const [isPreviewTerminalOpen, setIsPreviewTerminalOpen] = useState(false)
  const [isPreviewCopiesOpen, setIsPreviewCopiesOpen] = useState(true)
  const [isPreviewDeletesOpen, setIsPreviewDeletesOpen] = useState(false)
  const [isPreviewSkippedOpen, setIsPreviewSkippedOpen] = useState(false)

  return (
    <section className="settings-panel">
      <section
        className={`panel preview-header ${runtimePhase === 'running' && runtimeScope === 'preview' ? 'runtime-panel runtime-panel--running' : ''} ${runtimePhase === 'preview-ready' && runtimeScope === 'preview' ? 'runtime-panel runtime-panel--completed' : ''} ${runtimePhase === 'error' && runtimeScope === 'preview' ? 'runtime-panel runtime-panel--error' : ''} ${isPreviewSummaryOpen ? 'is-open' : 'is-collapsed'}`.trim()}
      >
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Sync Preview</p>
            <h2>{previewPlan ? 'Planned file actions' : 'No preview generated yet'}</h2>
            <p className="transfer-path preview-runtime-copy">{previewStatusMessage}</p>
          </div>
          <div className="panel-actions">
            <span className={`status-pill status-pill--${runtimeBadgeTone}`}>
              {runtimePhase === 'running' && runtimeScope === 'preview' ? (
                <span className="spinner spinner--inline" />
              ) : (
                <span className="status-dot" />
              )}
              {runtimeScope === 'preview'
                ? runtimePhase === 'preview-ready'
                  ? 'Preview ready'
                  : runtimeStatusLabel
                : previewPlan
                  ? 'Preview ready'
                  : 'Idle'}
            </span>
            <button
              className="secondary-button"
              disabled={!canStartSync || runtimePhase === 'running'}
              onClick={() => void handlePreview()}
              type="button"
            >
              {isPreviewing ? 'Refreshing...' : 'Refresh preview'}
            </button>
            <button
              className="primary-button"
              disabled={!canStartSync || runtimePhase === 'running'}
              onClick={() => void handleStartSync()}
              type="button"
            >
              Run update
            </button>
            {runtimePhase === 'running' && runtimeScope === 'preview' ? (
              <button
                className="utility-button utility-button--danger utility-button--strong"
                onClick={() => void handleStopPreview()}
                type="button"
              >
                Stop
              </button>
            ) : null}
            {runtimePhase === 'error' && runtimeScope === 'preview' ? (
              <>
                <button
                  className="utility-button utility-button--danger utility-button--strong"
                  onClick={() => void handleRetryRuntimeAction()}
                  type="button"
                >
                  Retry
                </button>
                <button
                  className="utility-button"
                  onClick={() => setIsPreviewTerminalOpen(true)}
                  type="button"
                >
                  View logs
                </button>
              </>
            ) : null}
            <CollapseButton
              isOpen={isPreviewSummaryOpen}
              onToggle={() => setIsPreviewSummaryOpen((previous) => !previous)}
              title="Toggle preview summary"
            />
          </div>
        </div>

        {isPreviewSummaryOpen && previewPlan ? (
          <div className="stats-grid">
            <StatCard
              density="compact"
              detail={previewCopyDetail}
              label="Files to copy"
              value={previewPlan.summary.copyCount.toString()}
            />
            <StatCard
              density="compact"
              detail="Queued for deletion"
              label="Files to delete"
              value={previewPlan.summary.deleteCount.toString()}
            />
            <StatCard
              density="compact"
              detail={
                previewPlan.firmwareRetentionEnabled
                  ? 'Retained by firmware protection'
                  : 'Retention off for this preview'
              }
              label="Skipped deletes"
              value={previewPlan.summary.skippedDeleteCount.toString()}
            />
            <StatCard
              density="compact-meta"
              detail={`${previewPlan.selectedDrive}:\\ source`}
              label="Generated"
              value={formatTimestamp(previewPlan.generatedAt)}
            />
          </div>
        ) : null}

        {isPreviewSummaryOpen && !previewPlan ? (
          <EmptyState
            detail="Run preview to inspect files to copy, deletes, and retained firmware paths."
            title="No preview available"
          />
        ) : null}
      </section>

      <TerminalPanel
        entries={previewTerminalEntries}
        isCollapsible
        isOpen={isPreviewTerminalOpen}
        onCancel={isPreviewing ? () => void handleStopPreview() : undefined}
        onToggle={() => setIsPreviewTerminalOpen((previous) => !previous)}
        status={previewStatusMessage}
        title="Preview terminal"
      />

      {previewPlan ? (
        <section className="view-grid view-grid--preview">
          <PlanPanel
            actions={previewActions.copies}
            className="plan-panel--primary"
            eyebrow="Incoming"
            emptyDetail="The source and destination already match for copy actions."
            emptyTitle="No files to copy"
            isOpen={isPreviewCopiesOpen}
            onToggle={() => setIsPreviewCopiesOpen((previous) => !previous)}
            title="Files to copy"
          />
          <PlanPanel
            actions={previewActions.deletes}
            className="plan-panel--secondary"
            eyebrow="Cleanup"
            emptyDetail="No local files are queued for deletion in this preview."
            emptyTitle="No files to delete"
            isOpen={isPreviewDeletesOpen}
            onToggle={() => setIsPreviewDeletesOpen((previous) => !previous)}
            title="Files to delete"
          />
          <PlanPanel
            actions={previewActions.skippedDeletes}
            className="plan-panel--secondary"
            eyebrow="Retained"
            emptyDetail="Firmware retention is not skipping any deletes in this preview."
            emptyTitle="No skipped deletes"
            isOpen={isPreviewSkippedOpen}
            onToggle={() => setIsPreviewSkippedOpen((previous) => !previous)}
            title="Skipped deletes"
          />
        </section>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 3: Rewrite `HistoryView.tsx`**

```tsx
import { LogList } from '../components/app-panels'
import { useSyncRuntimeContext } from '../context/SyncRuntimeContext'
import { formatTimestamp, statusTone } from '../lib/runtime'

export function HistoryView() {
  const { historyRecords, isHistoryLoading, refreshHistory } = useSyncRuntimeContext()

  return (
    <section className="settings-panel">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Run History</p>
            <h2>Persistent local audit trail</h2>
          </div>
          <button className="secondary-button" onClick={() => void refreshHistory()} type="button">
            Refresh history
          </button>
        </div>

        {isHistoryLoading ? <p className="empty-copy">Loading run history...</p> : null}

        {!isHistoryLoading && historyRecords.length === 0 ? (
          <p className="empty-copy">
            No completed, stopped, or failed runs have been recorded yet.
          </p>
        ) : null}

        <div className="history-list">
          {historyRecords.map((record) => (
            <article className="history-card" key={record.id}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{record.status.replace('_', ' ')}</p>
                  <h2>{formatTimestamp(record.finishedAt)}</h2>
                </div>
                <span className={`status-pill status-pill--${statusTone(record.status)}`}>
                  <span className="status-dot" />
                  {record.status}
                </span>
              </div>
              <div className="history-section history-meta">
                <span className="history-chip">
                  Drive {record.selectedDrive ? `${record.selectedDrive}:\\` : 'n/a'}
                </span>
                <span className="history-chip">{record.enabledFolders.length} folders enabled</span>
                <span className="history-chip">
                  Firmware retention {record.firmwareRetentionEnabled ? 'on' : 'off'}
                </span>
              </div>
              <div className="history-section history-stats">
                <span>Copied {record.summary.copiedFiles}</span>
                <span>Deleted {record.summary.deletedFiles}</span>
                <span>Skipped deletes {record.summary.skippedDeletes}</span>
                <span>{record.summary.copiedBytesLabel || '0 bytes copied'}</span>
              </div>
              {record.errorMessage ? (
                <div className="banner banner--error">{record.errorMessage}</div>
              ) : null}
              <div className="history-section">
                <p className="history-section-title">Recent actions</p>
                <LogList
                  emptyDetail="Completed, stopped, or failed file actions will be listed here."
                  emptyTitle="No recent actions recorded"
                  items={record.recentActions}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}
```

- [ ] **Step 4: Rewrite `FolderSelectionView.tsx`**

```tsx
import { useSyncRuntimeContext } from '../context/SyncRuntimeContext'

export function FolderSelectionView() {
  const {
    appNotice,
    draftSettings,
    enabledFolderCount,
    folderDefinitions,
    hasUnsavedChanges,
    isSaving,
    handleApplySettings,
    handleFolderToggle,
    handleResetSettings,
  } = useSyncRuntimeContext()

  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Folder Selection</p>
          <h2>Choose mirrored folders</h2>
        </div>
        <span className="hint-text">{enabledFolderCount} enabled</span>
      </div>

      <div className="folder-grid">
        {folderDefinitions.map((folder) => (
          <button
            className={`switch-row ${draftSettings.folders[folder.key] ? 'is-on' : ''}`}
            disabled={folder.isMandatory}
            key={folder.key}
            onClick={() => handleFolderToggle(folder)}
            type="button"
          >
            <span className="folder-copy">
              <strong>{folder.label}</strong>
            </span>
            <span className={`switch ${draftSettings.folders[folder.key] ? 'is-on' : ''}`}>
              <span className="switch-thumb" />
            </span>
          </button>
        ))}
      </div>

      <div className="action-row action-row--settings">
        {appNotice ? <span className="save-indicator">{appNotice}</span> : null}
        <button
          className="primary-button"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={() => void handleApplySettings()}
          type="button"
        >
          {isSaving ? 'Saving...' : 'Apply'}
        </button>
        <button
          className="secondary-button"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={handleResetSettings}
          type="button"
        >
          Cancel
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Rewrite `FirmwareRetentionView.tsx`**

```tsx
import { useSyncRuntimeContext } from '../context/SyncRuntimeContext'

export function FirmwareRetentionView() {
  const {
    draftSettings,
    hasUnsavedChanges,
    isSaving,
    handleApplySettings,
    handleFirmwareRetentionToggle,
    handleResetSettings,
  } = useSyncRuntimeContext()

  const firmwareRetentionEnabled = draftSettings.firmwareRetentionEnabled

  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Firmware Retention</p>
          <h2>Protect `*\\Firmware\\*` deletes</h2>
        </div>
      </div>

      <button
        className={`retention-card ${firmwareRetentionEnabled ? 'is-on' : ''}`}
        onClick={handleFirmwareRetentionToggle}
        type="button"
      >
        <div>
          <strong>
            {firmwareRetentionEnabled
              ? 'Firmware retention enabled'
              : 'Firmware retention disabled'}
          </strong>
          <p>
            When enabled, local files inside folders named `Firmware` are preserved even if the
            ShareFile source no longer contains them.
          </p>
        </div>
        <span className={`switch ${firmwareRetentionEnabled ? 'is-on' : ''}`}>
          <span className="switch-thumb" />
        </span>
      </button>

      <div className="action-row action-row--settings">
        <button
          className="primary-button"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={() => void handleApplySettings()}
          type="button"
        >
          Apply
        </button>
        <button
          className="secondary-button"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={handleResetSettings}
          type="button"
        >
          Cancel
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 7: Commit**

```bash
git add src/views/HomeView.tsx src/views/PreviewView.tsx src/views/HistoryView.tsx src/views/FolderSelectionView.tsx src/views/FirmwareRetentionView.tsx
git commit -m "refactor: views consume context directly, remove all prop interfaces, move topbar into HomeView"
```

---

## Task 7: Simplify `App.tsx`

**Files:**
- Modify: `src/App.tsx`

Wrap with `SyncRuntimeProvider`. Remove the topbar block (moved to HomeView). Render views with no props. `AppContent` reads the minimal set it still needs (activeView, isInitializing, topLevelAppError, appNotice, handleQuit, setActiveView, navigateToHistory) from context.

- [ ] **Step 1: Rewrite `App.tsx`**

```tsx
import './App.css'
import { NavButton } from './components/app-panels'
import { SyncRuntimeProvider, useSyncRuntimeContext } from './context/SyncRuntimeContext'
import { FirmwareRetentionView } from './views/FirmwareRetentionView'
import { FolderSelectionView } from './views/FolderSelectionView'
import { HistoryView } from './views/HistoryView'
import { HomeView } from './views/HomeView'
import { PreviewView } from './views/PreviewView'

function AppContent() {
  const runtime = useSyncRuntimeContext()

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div>
            <h1>TeamUpdater V3</h1>
          </div>
          <nav className="nav">
            <NavButton
              active={runtime.activeView === 'home'}
              label="Home"
              onClick={() => runtime.setActiveView('home')}
            />
            <NavButton
              active={runtime.activeView === 'preview'}
              label="Preview"
              onClick={() => runtime.setActiveView('preview')}
            />
            <NavButton
              active={runtime.activeView === 'history'}
              label="History"
              onClick={runtime.navigateToHistory}
            />
            <NavButton
              active={runtime.activeView === 'folder-selection'}
              label="Folder Selection"
              onClick={() => runtime.setActiveView('folder-selection')}
            />
            <NavButton
              active={runtime.activeView === 'firmware-retention'}
              label="Firmware Retention"
              onClick={() => runtime.setActiveView('firmware-retention')}
            />
          </nav>
        </div>
        <div className="sidebar-footer">
          <button
            className="utility-button utility-button--ghost sidebar-quit"
            onClick={() => void runtime.handleQuit()}
            type="button"
          >
            Quit
          </button>
        </div>
      </aside>

      <main className="content">
        {runtime.topLevelAppError ? (
          <div className="banner banner--error">{runtime.topLevelAppError}</div>
        ) : null}
        {runtime.appNotice ? (
          <div className="banner banner--success">{runtime.appNotice}</div>
        ) : null}

        {runtime.isInitializing ? (
          <section className="panel panel--loading">
            <div className="spinner" />
            <p>Loading ShareFile configuration...</p>
          </section>
        ) : null}

        {!runtime.isInitializing && runtime.activeView === 'home' ? <HomeView /> : null}
        {!runtime.isInitializing && runtime.activeView === 'preview' ? <PreviewView /> : null}
        {!runtime.isInitializing && runtime.activeView === 'history' ? <HistoryView /> : null}
        {!runtime.isInitializing && runtime.activeView === 'folder-selection' ? <FolderSelectionView /> : null}
        {!runtime.isInitializing && runtime.activeView === 'firmware-retention' ? <FirmwareRetentionView /> : null}
      </main>
    </div>
  )
}

function App() {
  return (
    <SyncRuntimeProvider>
      <AppContent />
    </SyncRuntimeProvider>
  )
}

export default App
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```
Expected: All tests pass

- [ ] **Step 3: Smoke test the full app**

```bash
npm run tauri dev
```

Verify:
- App starts without blue BG (backdrop-filter fix)
- Sidebar, panels, and topbar all render correctly
- Navigation between all 5 views works
- Preview runs and auto-navigates to Preview view
- Sync runs and shows live file progress in the terminal/feed panels
- History loads when History nav is clicked
- Folder toggles and settings save correctly
- Firmware retention toggle works
- Quit button works (with confirmation prompt when running)

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "refactor: wrap app in SyncRuntimeProvider, remove prop drilling from App, views render with no props"
```

---

## Self-Review

**Spec coverage:**
- ✅ CSS backdrop-filter removed from sidebar, panel, topbar (Task 1)
- ✅ `getErrorMessage` deduplicated into `lib/errors.ts` (Task 2)
- ✅ `useReducer` replaces 8 `useState` calls in `useRuntime` (Task 4)
- ✅ Optimistic state races fixed — `PREVIEW_INITIATED`/`SYNC_INITIATED` are single dispatches; backend events are idempotent in the reducer (Task 3/4)
- ✅ Context eliminates prop drilling (Tasks 5–7)
- ✅ Topbar moved into HomeView (Task 6)
- ✅ Redundant `copiedCount`/`deletedCount` props removed — `runState.copiedCount`/`runState.deletedCount` used directly (Task 6)

**Placeholder scan:** No TBDs, no "implement later", all code blocks are complete.

**Type consistency:**
- `RuntimeReducerState` defined in Task 3, imported in Task 4 ✅
- `RuntimeAction` defined in Task 3, dispatched in Task 4 ✅
- `useSyncRuntimeContext()` defined in Task 5, consumed in Tasks 6 and 7 ✅
- `SyncRuntimeProvider` defined in Task 5, used in Task 7 ✅
- `handleApplySettings` name in `useSyncRuntime` matches usage in `FolderSelectionView` and `FirmwareRetentionView` ✅
