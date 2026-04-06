# TeamUpdater V3 Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve code quality, UX, and correctness across the Tauri + React codebase without breaking existing behaviour or the public `useSyncRuntime` API.

**Architecture:** Eight independent improvement areas applied in dependency order — utility fixes first, then the hook split that all subsequent frontend changes build on, then Rust backend cleanup, finishing with the folder-definitions single-source-of-truth change that touches both sides.

**Tech Stack:** React 19, TypeScript, Vitest, Tauri 2, Rust (thiserror, walkdir)

**Test commands:**
- Frontend: `npm test -- run` (runs vitest once, no watch)
- Single file: `npm test -- run src/lib/runtime.test.ts`
- Rust: `cd src-tauri && cargo test`

---

## File Map

### Modified
| File | Change |
|---|---|
| `src/lib/runtime.ts` | Fix `getScopedTerminalEntries` signature; cap log arrays |
| `src/lib/runtime.test.ts` | Add `getScopedTerminalEntries` tests; add log-cap tests |
| `src/hooks/useSyncRuntime.ts` | Becomes thin coordinator calling three sub-hooks |
| `src/hooks/useSyncRuntime.test.tsx` | Remove `saveSettings` side-effect assertion; update stop mock |
| `src/views/HomeView.tsx` | Move 3 panel-toggle states in; remove from props interface |
| `src/views/PreviewView.tsx` | Move 5 panel-toggle states in; remove from props interface |
| `src/App.tsx` | Remove 8 panel states; filter drive dropdown; add empty-state option |
| `src/lib/desktop.ts` | Remove `previewSyncPlan`; rename stop fn; add `getFolderDefinitions` |
| `src/types.ts` | Add optional `destinationRoot` to `AppSettings`; add `FolderDefinition` note |
| `src/lib/settings.ts` | Accept `folderDefinitions` param; remove module constant |
| `src/lib/settings.test.ts` | Pass `folderDefinitions` to all helpers |
| `src-tauri/src/app.rs` | Remove dead commands; rename stop; add `get_folder_definitions` |
| `src-tauri/src/sync_engine.rs` | Remove `preview_sync`; read destination root from settings |
| `src-tauri/src/models.rs` | Add `destination_root` to `AppSettings`; add `FolderDefinition` struct |

### Created
| File | Purpose |
|---|---|
| `src/hooks/useSettings.ts` | Settings state and mutation actions |
| `src/hooks/useDriveDetection.ts` | Drive info, filtered dropdown list, drive status |
| `src/hooks/useRuntime.ts` | Sync/preview lifecycle, event listener, history, navigation |

---

## Task 1 — Fix `getScopedTerminalEntries` (Section 4d)

**Files:**
- Modify: `src/lib/runtime.ts`
- Modify: `src/lib/runtime.test.ts`

The function currently takes three params and filters twice. The second filter makes the first redundant. Drop the `activeTerminalScope` param.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/runtime.test.ts`, inside the existing `describe('runtime helpers', ...)` block:

```ts
it('getScopedTerminalEntries returns entries matching the requested scope only', () => {
  const entries: TerminalEntry[] = [
    { line: 'sync line', scope: 'sync', timestamp: '1' },
    { line: 'preview line', scope: 'preview', timestamp: '2' },
    { line: 'sync line 2', scope: 'sync', timestamp: '3' },
  ]

  expect(getScopedTerminalEntries(entries, 'sync')).toEqual([
    { line: 'sync line', scope: 'sync', timestamp: '1' },
    { line: 'sync line 2', scope: 'sync', timestamp: '3' },
  ])
  expect(getScopedTerminalEntries(entries, 'preview')).toEqual([
    { line: 'preview line', scope: 'preview', timestamp: '2' },
  ])
})
```

Add `getScopedTerminalEntries` to the import at the top of `runtime.test.ts`:

```ts
import {
  appendTerminalEntry,
  getCleanupFeedItems,
  getDriveStatus,
  getHomeCounts,
  getPreviewActions,
  getScopedTerminalEntries,
  getTransferFeedItems,
  initialRunState,
  reduceSyncEvent,
} from './runtime'
```

- [ ] **Step 2: Run test to verify it fails**

```
npm test -- run src/lib/runtime.test.ts
```

Expected: FAIL — `getScopedTerminalEntries` called with wrong number of arguments (currently takes 3).

- [ ] **Step 3: Update `getScopedTerminalEntries` in `runtime.ts`**

Replace the existing function:

```ts
export function getScopedTerminalEntries(
  terminalEntries: TerminalEntry[],
  scope: SyncEventScope,
) {
  return terminalEntries.filter((entry) => entry.scope === scope)
}
```

- [ ] **Step 4: Update the callers in `useSyncRuntime.ts`**

Find the two `useMemo` blocks that call `getScopedTerminalEntries`. Replace:

```ts
const syncTerminalEntries = useMemo(
  () => getScopedTerminalEntries(terminalEntries, activeTerminalScope, 'sync'),
  [activeTerminalScope, terminalEntries],
)
const previewTerminalEntries = useMemo(
  () => getScopedTerminalEntries(terminalEntries, activeTerminalScope, 'preview'),
  [activeTerminalScope, terminalEntries],
)
```

With:

```ts
const syncTerminalEntries = useMemo(
  () => getScopedTerminalEntries(terminalEntries, 'sync'),
  [terminalEntries],
)
const previewTerminalEntries = useMemo(
  () => getScopedTerminalEntries(terminalEntries, 'preview'),
  [terminalEntries],
)
```

Then remove the `activeTerminalScope` state and all its setters from `useSyncRuntime.ts`.

Remove the state declaration:
```ts
// DELETE this line:
const [activeTerminalScope, setActiveTerminalScope] = useState<SyncEventScope | null>(null)
```

Remove every `setActiveTerminalScope(...)` call in the file (there are 5 — in the event listener switch cases for `preview_started`, `log_line`, `run_started`, `handlePreview`, and `handleStartSync`).

Remove `SyncEventScope` from the import in `useSyncRuntime.ts` if it is no longer used anywhere else in that file.

- [ ] **Step 5: Run tests to verify they pass**

```
npm test -- run
```

Expected: all passing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/runtime.ts src/lib/runtime.test.ts src/hooks/useSyncRuntime.ts
git commit -m "refactor: simplify getScopedTerminalEntries to single-pass filter"
```

---

## Task 2 — Cap `transferLog` and `deletionLog` (Section 4a)

**Files:**
- Modify: `src/lib/runtime.ts`
- Modify: `src/lib/runtime.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/runtime.test.ts` inside `describe('runtime helpers', ...)`:

```ts
it('caps transferLog at 400 entries on file_copied', () => {
  let state = initialRunState
  state = { ...state, transferLog: Array.from({ length: 400 }, (_, i) => `C:\\file${i}.txt`) }

  const next = reduceSyncEvent(state, {
    kind: 'file_copied',
    destinationPath: 'C:\\overflow.txt',
    message: 'Copied',
    totalCopied: 401,
  })

  expect(next.transferLog).toHaveLength(400)
  expect(next.transferLog.at(-1)).toBe('C:\\overflow.txt')
  expect(next.transferLog[0]).toBe('C:\\file1.txt')
})

it('caps deletionLog at 400 entries on file_deleted', () => {
  let state = initialRunState
  state = { ...state, deletionLog: Array.from({ length: 400 }, (_, i) => `C:\\file${i}.txt`) }

  const next = reduceSyncEvent(state, {
    kind: 'file_deleted',
    destinationPath: 'C:\\overflow.txt',
    message: 'Deleted',
    totalDeleted: 401,
  })

  expect(next.deletionLog).toHaveLength(400)
  expect(next.deletionLog.at(-1)).toBe('C:\\overflow.txt')
  expect(next.deletionLog[0]).toBe('C:\\file1.txt')
})
```

- [ ] **Step 2: Run tests to verify they fail**

```
npm test -- run src/lib/runtime.test.ts
```

Expected: the two new tests FAIL (arrays exceed 400).

- [ ] **Step 3: Apply the cap in `reduceSyncEvent`**

In `src/lib/runtime.ts`, update the `file_copied` case:

```ts
case 'file_copied':
  return {
    ...previous,
    copiedCount: event.totalCopied,
    transferLog: [...previous.transferLog, event.destinationPath].slice(-400),
    lastMessage: event.message,
  }
```

Update the `file_deleted` case:

```ts
case 'file_deleted':
  return {
    ...previous,
    deletedCount: event.totalDeleted,
    deletionLog: [...previous.deletionLog, event.destinationPath].slice(-400),
    lastMessage: event.message,
  }
```

- [ ] **Step 4: Run tests**

```
npm test -- run src/lib/runtime.test.ts
```

Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/runtime.ts src/lib/runtime.test.ts
git commit -m "fix: cap transferLog and deletionLog at 400 entries"
```

---

## Task 3 — Create `useSettings.ts` (Section 1)

**Files:**
- Create: `src/hooks/useSettings.ts`

- [ ] **Step 1: Create the file**

```ts
// src/hooks/useSettings.ts
import { useMemo, useState } from 'react'
import { saveSettings } from '../lib/desktop'
import { areSettingsEqual, buildDefaultSettings, mergeSettings } from '../lib/settings'
import type { AppSettings, FolderDefinition } from '../types'

export interface UseSettingsOptions {
  onError: (message: string | null) => void
  onNotice: (message: string | null) => void
}

export interface UseSettingsResult {
  settings: AppSettings
  draftSettings: AppSettings
  isSaving: boolean
  hasUnsavedChanges: boolean
  hydrate: (loadedSettings: AppSettings, autoSelectedDrive: string | null) => void
  persistSettings: (nextSettings: AppSettings) => Promise<void>
  handleResetSettings: () => void
  handleFolderToggle: (folder: FolderDefinition) => void
  handleFirmwareRetentionToggle: () => void
  setSelectedDrive: (drive: string | null) => void
}

export function useSettings({ onError, onNotice }: UseSettingsOptions): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings>(buildDefaultSettings())
  const [draftSettings, setDraftSettings] = useState<AppSettings>(buildDefaultSettings())
  const [isSaving, setIsSaving] = useState(false)

  const hasUnsavedChanges = useMemo(
    () => !areSettingsEqual(settings, draftSettings),
    [settings, draftSettings],
  )

  const hydrate = (loadedSettings: AppSettings, autoSelectedDrive: string | null) => {
    const merged = mergeSettings(loadedSettings, autoSelectedDrive)
    setSettings(merged)
    setDraftSettings(merged)
  }

  const persistSettings = async (nextSettings: AppSettings) => {
    setIsSaving(true)
    onError(null)
    onNotice(null)
    try {
      await saveSettings(nextSettings)
      setSettings(nextSettings)
      setDraftSettings(nextSettings)
      onNotice('Settings saved.')
    } catch (error) {
      onError(getErrorMessage(error, 'Unable to save settings.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetSettings = () => {
    setDraftSettings(settings)
    onError(null)
    onNotice(null)
  }

  const handleFolderToggle = (folder: FolderDefinition) => {
    if (folder.isMandatory) return
    setDraftSettings((previous) => ({
      ...previous,
      folders: { ...previous.folders, [folder.key]: !previous.folders[folder.key] },
    }))
  }

  const handleFirmwareRetentionToggle = () => {
    setDraftSettings((previous) => ({
      ...previous,
      firmwareRetentionEnabled: !previous.firmwareRetentionEnabled,
    }))
  }

  const setSelectedDrive = (drive: string | null) => {
    setDraftSettings((previous) => ({ ...previous, selectedDrive: drive }))
  }

  return {
    settings,
    draftSettings,
    isSaving,
    hasUnsavedChanges,
    hydrate,
    persistSettings,
    handleResetSettings,
    handleFolderToggle,
    handleFirmwareRetentionToggle,
    setSelectedDrive,
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npm run build 2>&1 | head -30
```

Expected: no errors from the new file (the rest of the app still uses the old hook).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useSettings.ts
git commit -m "feat: extract useSettings hook from useSyncRuntime"
```

---

## Task 4 — Create `useDriveDetection.ts` (Section 1 + Section 3)

**Files:**
- Create: `src/hooks/useDriveDetection.ts`

This hook implements the filtered drive list (Section 3) from the start — only reachable drives plus the currently-selected drive (if not reachable) appear in the dropdown.

- [ ] **Step 1: Create the file**

```ts
// src/hooks/useDriveDetection.ts
import { useMemo, useState } from 'react'
import { getDriveStatus } from '../lib/runtime'
import type { DetectDrivesResponse, DriveCandidate } from '../types'

export interface UseDriveDetectionOptions {
  selectedDrive: string | null
}

export interface UseDriveDetectionResult {
  driveInfo: DetectDrivesResponse
  selectableDrives: { letter: string; isReachable: boolean }[]
  driveStatus: { tone: 'online' | 'offline'; label: string }
  selectedCandidate: DriveCandidate | null
  initialize: (detected: DetectDrivesResponse) => void
}

export function useDriveDetection({ selectedDrive }: UseDriveDetectionOptions): UseDriveDetectionResult {
  const [driveInfo, setDriveInfo] = useState<DetectDrivesResponse>({
    candidates: [],
    autoSelected: null,
  })

  const initialize = (detected: DetectDrivesResponse) => {
    setDriveInfo(detected)
  }

  const selectedCandidate = useMemo(
    () => driveInfo.candidates.find((candidate) => candidate.letter === selectedDrive) ?? null,
    [driveInfo.candidates, selectedDrive],
  )

  const selectableDrives = useMemo(() => {
    const reachable = driveInfo.candidates.map((candidate) => ({
      letter: candidate.letter,
      isReachable: true,
    }))
    const reachableLetters = new Set(driveInfo.candidates.map((candidate) => candidate.letter))
    if (selectedDrive && !reachableLetters.has(selectedDrive)) {
      return [...reachable, { letter: selectedDrive, isReachable: false }].sort((a, b) =>
        a.letter.localeCompare(b.letter),
      )
    }
    return reachable
  }, [driveInfo.candidates, selectedDrive])

  const driveStatus = useMemo(
    () => getDriveStatus(selectedDrive, selectedCandidate),
    [selectedCandidate, selectedDrive],
  )

  return {
    driveInfo,
    selectableDrives,
    driveStatus,
    selectedCandidate,
    initialize,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npm run build 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useDriveDetection.ts
git commit -m "feat: extract useDriveDetection hook with filtered drive list"
```

---

## Task 5 — Create `useRuntime.ts` (Section 1 + Section 4b)

**Files:**
- Create: `src/hooks/useRuntime.ts`

This is the largest new file. It owns the Tauri event listener, all sync/preview state, history, and navigation. The duplicate `refreshHistoryFromRuntime` function is never added — `refreshHistory` is used everywhere from the start (this is Section 4b applied inline).

- [ ] **Step 1: Create the file**

```ts
// src/hooks/useRuntime.ts
import { useCallback, useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  detectShareFileDrives,
  isDesktopRuntime,
  loadRunHistory,
  loadSettings,
  quitApp,
  requestPreviewStop,
  requestSyncStop,
  startPreview,
  startSync,
  writeClientLog,
} from '../lib/desktop'
import {
  appendTerminalEntry,
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
  initialRunState,
  reduceSyncEvent,
  type RuntimePhase,
  type RuntimeScope,
} from '../lib/runtime'
import { mergeSettings } from '../lib/settings'
import type {
  AppSettings,
  DetectDrivesResponse,
  DriveCandidate,
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
  onError: (message: string | null) => void
  onNotice: (message: string | null) => void
  hydrateSettings: (loadedSettings: AppSettings, autoSelectedDrive: string | null) => void
  initializeDrives: (detected: DetectDrivesResponse) => void
}

export function useRuntime({
  draftSettings,
  autoSelectedDrive,
  selectedCandidate,
  onError,
  onNotice,
  hydrateSettings,
  initializeDrives,
}: UseRuntimeOptions) {
  const [activeView, setActiveView] = useState<NavView>('home')
  const [runState, setRunState] = useState<SyncRunState>(initialRunState)
  const [previewPlan, setPreviewPlan] = useState<SyncPlan | null>(null)
  const [historyRecords, setHistoryRecords] = useState<RunAuditRecord[]>([])
  const [isInitializing, setIsInitializing] = useState(true)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewStatusMessage, setPreviewStatusMessage] = useState('Ready to generate a preview.')
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([])
  const [runtimePhase, setRuntimePhase] = useState<RuntimePhase>('idle')
  const [runtimeScope, setRuntimeScope] = useState<RuntimeScope>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  const refreshHistory = useCallback(async () => {
    if (!isDesktopRuntime) return
    setIsHistoryLoading(true)
    onError(null)
    try {
      const records = await loadRunHistory()
      setHistoryRecords(records)
    } catch (error) {
      onError(getErrorMessage(error, 'Unable to load run history.'))
    } finally {
      setIsHistoryLoading(false)
    }
  }, [onError])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const [loadedSettings, detectedDrives, loadedHistory] = await Promise.all([
          loadSettings(),
          detectShareFileDrives(),
          loadRunHistory(),
        ])
        if (cancelled) return
        hydrateSettings(loadedSettings, detectedDrives.autoSelected)
        initializeDrives(detectedDrives)
        setHistoryRecords(loadedHistory)
      } catch (error) {
        if (!cancelled) {
          onError(getErrorMessage(error, 'Unable to initialise the app.'))
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false)
          setIsHistoryLoading(false)
        }
      }
    }

    const unlistenPromise = isDesktopRuntime
      ? listen<SyncEvent>('sync://event', (event) => {
          if (cancelled) return
          const payload = event.payload

          switch (payload.kind) {
            case 'preview_started':
              setIsPreviewing(true)
              setRuntimePhase('running')
              setRuntimeScope('preview')
              setRuntimeError(null)
              setPreviewStatusMessage(payload.message)
              setTerminalEntries([])
              return
            case 'preview_completed':
              setIsPreviewing(false)
              setRuntimePhase('preview-ready')
              setRuntimeScope('preview')
              setRuntimeError(null)
              setPreviewPlan(payload.plan)
              setActiveView('preview')
              setPreviewStatusMessage(payload.message)
              return
            case 'preview_stopped':
              setIsPreviewing(false)
              setRuntimePhase('idle')
              setRuntimeScope('preview')
              setPreviewStatusMessage(payload.message)
              return
            case 'preview_failed':
              setIsPreviewing(false)
              setRuntimePhase('error')
              setRuntimeScope('preview')
              setRuntimeError(payload.message)
              setPreviewStatusMessage(payload.message)
              onError(payload.message)
              return
            case 'log_line':
              setTerminalEntries((previous) => appendTerminalEntry(previous, payload))
              return
            default:
              setRunState((previous) => reduceSyncEvent(previous, payload))
              if (payload.kind === 'run_started') {
                setRuntimePhase('running')
                setRuntimeScope('sync')
                setRuntimeError(null)
                setTerminalEntries([])
              }
              if (payload.kind === 'run_completed' || payload.kind === 'run_stopped') {
                setRuntimePhase('completed')
                setRuntimeScope('sync')
                setRuntimeError(null)
              }
              if (payload.kind === 'run_failed') {
                setRuntimePhase('error')
                setRuntimeScope('sync')
                setRuntimeError(payload.message)
                onError(payload.message)
              }
              if (
                payload.kind === 'run_completed' ||
                payload.kind === 'run_stopped' ||
                payload.kind === 'run_failed'
              ) {
                void refreshHistory()
              }
          }
        })
      : Promise.resolve(() => undefined)

    void init()

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void writeClientLog(
      'INFO',
      `Runtime state changed: phase=${runtimePhase}, scope=${runtimeScope ?? 'none'}`,
    )
  }, [runtimePhase, runtimeScope])

  // Derived
  const syncTerminalEntries = useMemo(
    () => getScopedTerminalEntries(terminalEntries, 'sync'),
    [terminalEntries],
  )
  const previewTerminalEntries = useMemo(
    () => getScopedTerminalEntries(terminalEntries, 'preview'),
    [terminalEntries],
  )
  const transferFeedItems = useMemo(
    () => getTransferFeedItems(runState.transferLog, syncTerminalEntries),
    [runState.transferLog, syncTerminalEntries],
  )
  const cleanupFeedItems = useMemo(
    () => getCleanupFeedItems(runState.deletionLog, syncTerminalEntries),
    [runState.deletionLog, syncTerminalEntries],
  )
  const previewActions = useMemo(() => getPreviewActions(previewPlan), [previewPlan])
  const previewCopyDetail = previewPlan ? `${previewPlan.summary.totalCopyBytesLabel} to copy` : undefined
  const plannedCopyCount = previewPlan?.summary.copyCount ?? runState.summary?.plannedCopyFiles ?? 0
  const plannedDeleteCount = previewPlan?.summary.deleteCount ?? runState.summary?.plannedDeleteFiles ?? 0
  const processedCount = runState.copiedCount + runState.deletedCount
  const processedTotal = plannedCopyCount + plannedDeleteCount
  const runtimeStatusLabel = getRuntimeStatusLabel(runtimePhase, runtimeScope)
  const runtimeBadgeTone = getRuntimeBadgeTone(runtimePhase)
  const homeTransferTitle =
    runState.currentItem?.displayName ??
    (runState.isRunning ? 'Preparing transfer' : 'No active transfer')
  const homeTransferDetail =
    runState.currentItem?.sourcePath ??
    (runState.isRunning ? runState.lastMessage : 'Run preview or update to start a transfer.')
  const runtimeHeadline = getRuntimeHeadline({
    isPreviewing,
    phase: runtimePhase,
    previewCount: previewPlan?.actions.length ?? 0,
    processedCount,
    processedTotal,
    runMessage: runState.lastMessage,
    runtimeError,
  })
  const runtimeCurrentTitle = getRuntimeCurrentTitle({
    homeTransferTitle,
    isPreviewing,
    phase: runtimePhase,
    previewStatusMessage,
    runtimeError,
  })
  const runtimeCurrentDetail = getRuntimeCurrentDetail({
    homeTransferDetail,
    isPreviewing,
    phase: runtimePhase,
    previewStatusMessage,
    runtimeError,
  })
  const runtimeCanViewResults = Boolean(previewPlan || runState.summary)
  const runtimeErrorTitle = runtimeScope === 'preview' ? 'Preview failed' : 'Update failed'
  const homePanelClassName = getHomePanelClassName(runtimePhase)

  // Actions
  const handlePreview = async () => {
    if (runState.isRunning || isPreviewing) return
    setIsPreviewing(true)
    setRuntimePhase('running')
    setRuntimeScope('preview')
    setRuntimeError(null)
    onError(null)
    onNotice(null)
    setPreviewStatusMessage('Preview queued.')
    setTerminalEntries([])
    try {
      const nextSettings = mergeSettings(draftSettings, autoSelectedDrive)
      setActiveView('preview')
      setPreviewPlan(null)
      await startPreview(nextSettings)
    } catch (error) {
      setIsPreviewing(false)
      const message = getErrorMessage(error, 'Unable to build the sync preview.')
      setRuntimePhase('error')
      setRuntimeScope('preview')
      setRuntimeError(message)
      setPreviewStatusMessage(message)
      onError(message)
    }
  }

  const handleStopPreview = async () => {
    try {
      await requestPreviewStop()
    } catch (error) {
      onError(getErrorMessage(error, 'Unable to request preview stop.'))
    }
  }

  const handleStartSync = async () => {
    if (runState.isRunning || isPreviewing) return
    setRuntimePhase('running')
    setRuntimeScope('sync')
    setRuntimeError(null)
    onError(null)
    onNotice(null)
    setTerminalEntries([])
    setPreviewStatusMessage('Ready to generate a preview.')
    setActiveView('home')
    setRunState({
      ...initialRunState,
      isRunning: true,
      lastMessage: 'Sync queued.',
    })
    try {
      await startSync(mergeSettings(draftSettings, autoSelectedDrive))
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to start sync.')
      setRuntimePhase('error')
      setRuntimeScope('sync')
      setRuntimeError(message)
      setRunState((previous) => ({
        ...previous,
        isRunning: false,
        lastMessage: message,
      }))
      onError(message)
    }
  }

  const handleStopSync = async () => {
    try {
      await requestSyncStop()
    } catch (error) {
      onError(getErrorMessage(error, 'Unable to request stop.'))
    }
  }

  const handleQuit = async () => {
    if (runState.isRunning || isPreviewing) {
      const shouldQuit = window.confirm('A preview or sync is currently running. Quit the app anyway?')
      if (!shouldQuit) return
    }
    await quitApp()
  }

  const handleRetryRuntimeAction = async () => {
    if (runtimeScope === 'preview') {
      await handlePreview()
      return
    }
    await handleStartSync()
  }

  const navigateToHistory = () => {
    setActiveView('history')
    void refreshHistory()
  }

  const handleViewResults = () => {
    if (previewPlan) {
      setActiveView('preview')
      return
    }
    navigateToHistory()
  }

  const enabledFolderCount = useMemo(
    () => {
      const folderDefs = Object.keys(draftSettings.folders)
      return folderDefs.filter((key) => draftSettings.folders[key]).length
    },
    [draftSettings.folders],
  )

  const homeCounts = useMemo(
    () => getHomeCounts(enabledFolderCount, previewPlan, runState.summary),
    [enabledFolderCount, previewPlan, runState.summary],
  )

  return {
    activeView,
    setActiveView,
    runState,
    previewPlan,
    historyRecords,
    isInitializing,
    isHistoryLoading,
    isPreviewing,
    previewStatusMessage,
    runtimePhase,
    runtimeScope,
    runtimeError,
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```
npm run build 2>&1 | head -30
```

Expected: no errors in the new file (app still uses the old monolithic hook).

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useRuntime.ts
git commit -m "feat: extract useRuntime hook from useSyncRuntime"
```

---

## Task 6 — Refactor `useSyncRuntime.ts` to coordinator (Section 1)

**Files:**
- Modify: `src/hooks/useSyncRuntime.ts`

Replace the entire file with the thin coordinator. The public `SyncRuntimeState & SyncRuntimeActions` interface is **unchanged** — all existing consumers continue to work.

- [ ] **Step 1: Replace `useSyncRuntime.ts`**

```ts
// src/hooks/useSyncRuntime.ts
import { useEffect, useMemo, useState } from 'react'
import { detectShareFileDrives, isDesktopRuntime, writeClientLog } from '../lib/desktop'
import { getFolderDefinitions, mergeSettings } from '../lib/settings'
import type { AppSettings, DetectDrivesResponse } from '../types'
import { useDriveDetection } from './useDriveDetection'
import { useRuntime } from './useRuntime'
import { useSettings } from './useSettings'

// Re-export types that consumers may import from this module
export type { SyncRuntimeState, SyncRuntimeActions } from './useSyncRuntime'

const folderDefinitions = getFolderDefinitions()

export interface SyncRuntimeState {
  activeView: import('../types').NavView
  appError: string | null
  appNotice: string | null
  canStartSync: boolean
  cleanupFeedItems: string[]
  draftSettings: AppSettings
  driveStatus: { tone: 'online' | 'offline'; label: string }
  enabledFolderCount: number
  folderDefinitions: import('../types').FolderDefinition[]
  hasUnsavedChanges: boolean
  historyRecords: import('../types').RunAuditRecord[]
  homeCounts: { label: string; value: string }[]
  homePanelClassName: string
  isHistoryLoading: boolean
  isInitializing: boolean
  isPreviewing: boolean
  isSaving: boolean
  previewActions: {
    copies: import('../types').SyncPlan['actions']
    deletes: import('../types').SyncPlan['actions']
    skippedDeletes: import('../types').SyncPlan['actions']
  }
  previewCopyDetail: string | undefined
  previewPlan: import('../types').SyncPlan | null
  previewStatusMessage: string
  previewTerminalEntries: import('../types').TerminalEntry[]
  processedCount: number
  processedTotal: number
  runState: import('../types').SyncRunState
  runtimeBadgeTone: string
  runtimeCanViewResults: boolean
  runtimeCurrentDetail: string
  runtimeCurrentTitle: string
  runtimeError: string | null
  runtimeErrorTitle: string
  runtimeHeadline: string
  runtimePhase: import('../lib/runtime').RuntimePhase
  runtimeScope: import('../lib/runtime').RuntimeScope
  runtimeStatusLabel: string
  selectableDrives: { letter: string; isReachable: boolean }[]
  settings: AppSettings
  syncTerminalEntries: import('../types').TerminalEntry[]
  topLevelAppError: string | null
  transferFeedItems: string[]
}

export interface SyncRuntimeActions {
  handleApplySettings: () => Promise<void>
  handleFolderToggle: (folder: import('../types').FolderDefinition) => void
  handleFirmwareRetentionToggle: () => void
  handlePreview: () => Promise<void>
  handleQuit: () => Promise<void>
  handleResetSettings: () => void
  handleRetryRuntimeAction: () => Promise<void>
  handleStartSync: () => Promise<void>
  handleStopPreview: () => Promise<void>
  handleStopSync: () => Promise<void>
  handleViewResults: () => void
  navigateToHistory: () => void
  refreshDriveDetection: () => Promise<void>
  refreshHistory: () => Promise<void>
  setActiveView: (view: import('../types').NavView) => void
  setSelectedDrive: (drive: string | null) => void
}

export function useSyncRuntime(): SyncRuntimeState & SyncRuntimeActions {
  const [appError, setAppError] = useState<string | null>(null)
  const [appNotice, setAppNotice] = useState<string | null>(null)

  const settings = useSettings({ onError: setAppError, onNotice: setAppNotice })
  const drive = useDriveDetection({ selectedDrive: settings.draftSettings.selectedDrive })
  const runtime = useRuntime({
    draftSettings: settings.draftSettings,
    autoSelectedDrive: drive.driveInfo.autoSelected,
    selectedCandidate: drive.selectedCandidate,
    onError: setAppError,
    onNotice: setAppNotice,
    hydrateSettings: settings.hydrate,
    initializeDrives: drive.initialize,
  })

  // Auto-dismiss notices
  useEffect(() => {
    if (!appNotice) return
    const timeoutId = window.setTimeout(() => setAppNotice(null), 2400)
    return () => window.clearTimeout(timeoutId)
  }, [appNotice])

  // Global error logging
  useEffect(() => {
    void writeClientLog('INFO', 'App mounted.')

    const handleWindowError = (event: ErrorEvent) => {
      const detail =
        event.error instanceof Error
          ? event.error.stack ?? event.error.message
          : event.message
      void writeClientLog(
        'ERROR',
        `Window error: ${event.message || 'Unknown error'}${detail ? ` | ${detail}` : ''}`,
      )
    }
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? event.reason.stack ?? event.reason.message
          : String(event.reason)
      void writeClientLog('ERROR', `Unhandled promise rejection: ${reason}`)
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // Log app errors
  useEffect(() => {
    if (!appError) return
    void writeClientLog('ERROR', `App error: ${appError}`)
  }, [appError])

  // Cross-cutting derived values
  const canStartSync =
    !runtime.isInitializing &&
    !runtime.runState.isRunning &&
    !runtime.isPreviewing &&
    Boolean(settings.draftSettings.selectedDrive) &&
    drive.driveStatus.tone === 'online'

  const topLevelAppError = runtime.runtimePhase === 'error' ? null : appError

  // Cross-cutting actions
  const handleApplySettings = async () => {
    await settings.persistSettings(
      mergeSettings(settings.draftSettings, drive.driveInfo.autoSelected),
    )
  }

  const refreshDriveDetection = async () => {
    setAppError(null)
    try {
      const detected = await detectShareFileDrives()
      const nextDrive = settings.draftSettings.selectedDrive || detected.autoSelected || null
      drive.initialize(detected)
      settings.setSelectedDrive(nextDrive)
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to detect ShareFile drives.'))
    }
  }

  return {
    // Settings
    settings: settings.settings,
    draftSettings: settings.draftSettings,
    isSaving: settings.isSaving,
    hasUnsavedChanges: settings.hasUnsavedChanges,
    folderDefinitions,
    handleApplySettings,
    handleResetSettings: settings.handleResetSettings,
    handleFolderToggle: settings.handleFolderToggle,
    handleFirmwareRetentionToggle: settings.handleFirmwareRetentionToggle,
    setSelectedDrive: settings.setSelectedDrive,
    // Drive
    driveStatus: drive.driveStatus,
    selectableDrives: drive.selectableDrives,
    // Runtime
    activeView: runtime.activeView,
    setActiveView: runtime.setActiveView,
    runState: runtime.runState,
    previewPlan: runtime.previewPlan,
    historyRecords: runtime.historyRecords,
    isInitializing: runtime.isInitializing,
    isHistoryLoading: runtime.isHistoryLoading,
    isPreviewing: runtime.isPreviewing,
    previewStatusMessage: runtime.previewStatusMessage,
    runtimePhase: runtime.runtimePhase,
    runtimeScope: runtime.runtimeScope,
    runtimeError: runtime.runtimeError,
    runtimeErrorTitle: runtime.runtimeErrorTitle,
    runtimeCanViewResults: runtime.runtimeCanViewResults,
    syncTerminalEntries: runtime.syncTerminalEntries,
    previewTerminalEntries: runtime.previewTerminalEntries,
    transferFeedItems: runtime.transferFeedItems,
    cleanupFeedItems: runtime.cleanupFeedItems,
    previewActions: runtime.previewActions,
    previewCopyDetail: runtime.previewCopyDetail,
    processedCount: runtime.processedCount,
    processedTotal: runtime.processedTotal,
    runtimeStatusLabel: runtime.runtimeStatusLabel,
    runtimeBadgeTone: runtime.runtimeBadgeTone,
    runtimeHeadline: runtime.runtimeHeadline,
    runtimeCurrentTitle: runtime.runtimeCurrentTitle,
    runtimeCurrentDetail: runtime.runtimeCurrentDetail,
    homePanelClassName: runtime.homePanelClassName,
    homeCounts: runtime.homeCounts,
    enabledFolderCount: runtime.enabledFolderCount,
    refreshHistory: runtime.refreshHistory,
    handlePreview: runtime.handlePreview,
    handleStopPreview: runtime.handleStopPreview,
    handleStartSync: runtime.handleStartSync,
    handleStopSync: runtime.handleStopSync,
    handleQuit: runtime.handleQuit,
    handleRetryRuntimeAction: runtime.handleRetryRuntimeAction,
    navigateToHistory: runtime.navigateToHistory,
    handleViewResults: runtime.handleViewResults,
    refreshDriveDetection,
    // Shared
    appError,
    appNotice,
    canStartSync,
    topLevelAppError,
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
```

- [ ] **Step 2: Run all tests**

```
npm test -- run
```

Expected: all tests pass. The test file mocks `../lib/desktop` which all sub-hooks import — Vitest's module mock intercepts the same module path regardless of which hook imports it.

- [ ] **Step 3: Build to confirm TypeScript is clean**

```
npm run build 2>&1 | head -50
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSyncRuntime.ts
git commit -m "refactor: useSyncRuntime becomes thin coordinator over three focused hooks"
```

---

## Task 7 — Move panel state into `HomeView` (Section 2)

**Files:**
- Modify: `src/views/HomeView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `HomeView.tsx`**

Remove from the `HomeViewProps` interface:

```ts
// DELETE these 6 lines from the interface:
isHomeTerminalOpen: boolean
isTransferFeedOpen: boolean
isCleanupFeedOpen: boolean
onToggleCleanupFeed: () => void
onToggleHomeTerminal: () => void
onToggleTransferFeed: () => void
```

Remove the same 6 params from the function destructuring.

Add `useState` import and three local state declarations at the top of the function body:

```ts
import { useState } from 'react'

export function HomeView({ ... }: HomeViewProps) {
  const [isHomeTerminalOpen, setIsHomeTerminalOpen] = useState(false)
  const [isTransferFeedOpen, setIsTransferFeedOpen] = useState(false)
  const [isCleanupFeedOpen, setIsCleanupFeedOpen] = useState(false)

  const homeTerminalOpen = isHomeTerminalOpen || runtimePhase === 'running'
  const transferFeedOpen = isTransferFeedOpen && transferFeedItems.length > 0
  const cleanupFeedOpen = isCleanupFeedOpen && cleanupFeedItems.length > 0
  ...
```

Update all internal references from the removed props to the local state. The three toggles that previously came from props now use the local setters:
- `onToggleHomeTerminal` → `() => setIsHomeTerminalOpen((previous) => !previous)`
- `onToggleTransferFeed` → `() => setIsTransferFeedOpen((previous) => !previous)`
- `onToggleCleanupFeed` → `() => setIsCleanupFeedOpen((previous) => !previous)`
- `onViewLogs` → `() => setIsHomeTerminalOpen(true)`

Also remove `onViewLogs` from the props interface since it is now internal.

- [ ] **Step 2: Update `App.tsx`**

Remove the three state declarations:
```ts
// DELETE:
const [isTransferFeedOpen, setIsTransferFeedOpen] = useState(false)
const [isCleanupFeedOpen, setIsCleanupFeedOpen] = useState(false)
const [isHomeTerminalOpen, setIsHomeTerminalOpen] = useState(false)
```

Remove the two derived booleans:
```ts
// DELETE:
const homeTerminalOpen = isHomeTerminalOpen || runtime.runtimePhase === 'running'
const transferFeedOpen = isTransferFeedOpen && runtime.transferFeedItems.length > 0
const cleanupFeedOpen = isCleanupFeedOpen && runtime.cleanupFeedItems.length > 0
```

Remove the corresponding props from the `<HomeView>` call: `isHomeTerminalOpen`, `isTransferFeedOpen`, `isCleanupFeedOpen`, `onToggleCleanupFeed`, `onToggleHomeTerminal`, `onToggleTransferFeed`, `onViewLogs`.

- [ ] **Step 3: Run tests**

```
npm test -- run
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add src/views/HomeView.tsx src/App.tsx
git commit -m "refactor: move HomeView panel toggle state into the view"
```

---

## Task 8 — Move panel state into `PreviewView` (Section 2)

**Files:**
- Modify: `src/views/PreviewView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `PreviewView.tsx`**

Remove from `PreviewViewProps`:
```ts
// DELETE these 10 lines from the interface:
isPreviewSummaryOpen: boolean
isPreviewTerminalOpen: boolean
isPreviewCopiesOpen: boolean
isPreviewDeletesOpen: boolean
isPreviewSkippedOpen: boolean
onTogglePreviewSummary: () => void
onTogglePreviewTerminal: () => void
onTogglePreviewCopies: () => void
onTogglePreviewDeletes: () => void
onTogglePreviewSkipped: () => void
```

Remove the same 10 params from the function destructuring.

Add `useState` import and five local state declarations (preserving the original initial values):

```ts
import { useState } from 'react'

export function PreviewView({ ... }: PreviewViewProps) {
  const [isPreviewSummaryOpen, setIsPreviewSummaryOpen] = useState(true)
  const [isPreviewTerminalOpen, setIsPreviewTerminalOpen] = useState(false)
  const [isPreviewCopiesOpen, setIsPreviewCopiesOpen] = useState(true)
  const [isPreviewDeletesOpen, setIsPreviewDeletesOpen] = useState(false)
  const [isPreviewSkippedOpen, setIsPreviewSkippedOpen] = useState(false)
  ...
```

Update all toggle references inside the component to use the local setters:
- `onTogglePreviewSummary` → `() => setIsPreviewSummaryOpen((previous) => !previous)`
- `onTogglePreviewTerminal` → `() => setIsPreviewTerminalOpen((previous) => !previous)`
- `onTogglePreviewCopies` → `() => setIsPreviewCopiesOpen((previous) => !previous)`
- `onTogglePreviewDeletes` → `() => setIsPreviewDeletesOpen((previous) => !previous)`
- `onTogglePreviewSkipped` → `() => setIsPreviewSkippedOpen((previous) => !previous)`
- `onViewLogs` → `() => setIsPreviewTerminalOpen(true)`

Remove `onViewLogs` from the interface as it is now internal.

- [ ] **Step 2: Update `App.tsx`**

Remove the five state declarations:
```ts
// DELETE:
const [isPreviewSummaryOpen, setIsPreviewSummaryOpen] = useState(true)
const [isPreviewTerminalOpen, setIsPreviewTerminalOpen] = useState(false)
const [isPreviewCopiesOpen, setIsPreviewCopiesOpen] = useState(true)
const [isPreviewDeletesOpen, setIsPreviewDeletesOpen] = useState(false)
const [isPreviewSkippedOpen, setIsPreviewSkippedOpen] = useState(false)
```

Remove the corresponding props from the `<PreviewView>` call: all five `is*` and all five `onToggle*` and `onViewLogs`.

After this task, `App.tsx` should have zero `useState` calls — all state is in `useSyncRuntime` or the views.

- [ ] **Step 3: Run tests**

```
npm test -- run
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add src/views/PreviewView.tsx src/App.tsx
git commit -m "refactor: move PreviewView panel toggle state into the view"
```

---

## Task 9 — Update drive dropdown in `App.tsx` (Section 3)

**Files:**
- Modify: `src/App.tsx`

The filtered `selectableDrives` (built in `useDriveDetection`) replaces the old all-26-letters list. Add a disabled empty-state option when no drives are available.

- [ ] **Step 1: Update the `<select>` block in `App.tsx`**

Find the existing drive `<select>` JSX. Replace the content:

```tsx
<select
  onChange={(event) => runtime.setSelectedDrive(event.target.value || null)}
  value={runtime.draftSettings.selectedDrive ?? ''}
>
  <option value="">Select drive</option>
  {runtime.selectableDrives.length === 0 ? (
    <option disabled value="">
      No drives detected — click Refresh
    </option>
  ) : (
    runtime.selectableDrives.map((candidate) => (
      <option key={candidate.letter} value={candidate.letter}>
        {candidate.letter}:\\ {candidate.isReachable ? 'reachable' : 'manual'}
      </option>
    ))
  )}
</select>
```

- [ ] **Step 2: Run tests**

```
npm test -- run
```

Expected: all passing.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "ux: filter drive dropdown to detected drives only"
```

---

## Task 10 — Remove `saveSettings` from `handleStartSync` (Section 4c)

**Files:**
- Modify: `src/hooks/useRuntime.ts`
- Modify: `src/hooks/useSyncRuntime.test.tsx`

- [ ] **Step 1: Update `handleStartSync` in `useRuntime.ts`**

The current `handleStartSync` in `useRuntime.ts` already does not call `saveSettings` (it was intentionally omitted when writing the new hook in Task 5). Verify: search for `saveSettings` in `src/hooks/useRuntime.ts`:

```
grep -n "saveSettings" src/hooks/useRuntime.ts
```

Expected: no output. If `saveSettings` is present (was accidentally included), remove the `await saveSettings(...)` call and the `import` of `saveSettings`.

- [ ] **Step 2: Update the test expectation**

In `src/hooks/useSyncRuntime.test.tsx`, find the test named `'handles preview and sync runtime events and retries the active scope'`. Around line 274, there is:

```ts
expect(desktopMocks.saveSettings).toHaveBeenCalled()
```

Change it to assert `saveSettings` was NOT called during `handleStartSync`:

```ts
expect(desktopMocks.saveSettings).not.toHaveBeenCalled()
```

- [ ] **Step 3: Run tests**

```
npm test -- run src/hooks/useSyncRuntime.test.tsx
```

Expected: all passing.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useRuntime.ts src/hooks/useSyncRuntime.test.tsx
git commit -m "fix: remove saveSettings side-effect from handleStartSync"
```

---

## Task 11 — Remove dead Rust commands (Section 5a + 5b)

**Files:**
- Modify: `src-tauri/src/app.rs`
- Modify: `src-tauri/src/sync_engine.rs`
- Modify: `src/lib/desktop.ts`
- Modify: `src/hooks/useSyncRuntime.test.tsx`

### 5a — Remove `preview_sync_plan`

- [ ] **Step 1: Remove from `app.rs`**

Delete the `preview_sync_plan` command function (lines ~30–32):
```rust
// DELETE:
#[tauri::command]
pub fn preview_sync_plan(settings: AppSettings) -> Result<SyncPlan, String> {
    preview_sync(settings).map_err(|error| error.to_string())
}
```

Remove `preview_sync_plan` from the `invoke_handler!` macro list.

Remove the import of `preview_sync` from the `use crate::sync_engine::...` line:
```rust
// Change:
use crate::sync_engine::{preview_sync, SyncCoordinator};
// To:
use crate::sync_engine::SyncCoordinator;
```

- [ ] **Step 2: Remove `preview_sync` from `sync_engine.rs`**

Delete the standalone function (around line 35–37):
```rust
// DELETE:
pub fn preview_sync(settings: AppSettings) -> Result<SyncPlan, SyncError> {
    build_plan_for_job(&settings, &AtomicBool::new(false), None)
}
```

- [ ] **Step 3: Remove `previewSyncPlan` from `desktop.ts`**

Delete the function and its import from `src/lib/desktop.ts`:
```ts
// DELETE this function:
export async function previewSyncPlan(settings: AppSettings): Promise<SyncPlan> {
  if (!isDesktopRuntime) {
    throw new Error('Preview is only available in the Tauri desktop runtime.')
  }
  return invoke<SyncPlan>('preview_sync_plan', { settings })
}
```

Also remove `SyncPlan` from the type import if it is no longer used in `desktop.ts`.

### 5b — Merge redundant stop commands

- [ ] **Step 4: Rename in `app.rs`**

Delete `request_preview_stop`:
```rust
// DELETE:
#[tauri::command]
pub fn request_preview_stop(state: State<'_, AppState>) -> Result<(), String> {
    state
        .coordinator
        .request_stop()
        .map_err(|error| error.to_string())
}
```

Rename `request_sync_stop` to `request_stop`:
```rust
#[tauri::command]
pub fn request_stop(state: State<'_, AppState>) -> Result<(), String> {
    state
        .coordinator
        .request_stop()
        .map_err(|error| error.to_string())
}
```

Update the `invoke_handler!` macro: remove `request_preview_stop`, rename `request_sync_stop` to `request_stop`.

- [ ] **Step 5: Update `desktop.ts`**

Replace both stop functions with a single one:
```ts
// DELETE requestSyncStop and requestPreviewStop. Add:
export async function requestStop() {
  if (!isDesktopRuntime) {
    throw new Error('Stop requests are only available in the Tauri desktop runtime.')
  }
  return invoke<void>('request_stop')
}
```

- [ ] **Step 6: Update `useRuntime.ts` imports and calls**

In `src/hooks/useRuntime.ts`, replace the imports:
```ts
// Change:
import { ..., requestPreviewStop, requestSyncStop, ... } from '../lib/desktop'
// To:
import { ..., requestStop, ... } from '../lib/desktop'
```

Update `handleStopPreview`:
```ts
const handleStopPreview = async () => {
  try {
    await requestStop()
  } catch (error) {
    onError(getErrorMessage(error, 'Unable to request preview stop.'))
  }
}
```

Update `handleStopSync`:
```ts
const handleStopSync = async () => {
  try {
    await requestStop()
  } catch (error) {
    onError(getErrorMessage(error, 'Unable to request stop.'))
  }
}
```

- [ ] **Step 7: Update the test mock**

In `src/hooks/useSyncRuntime.test.tsx`:

In `desktopMocks` (the `vi.hoisted` block), replace `requestPreviewStop` and `requestSyncStop` with `requestStop`:
```ts
const desktopMocks = vi.hoisted(() => ({
  detectShareFileDrives: vi.fn(),
  loadRunHistory: vi.fn(),
  loadSettings: vi.fn(),
  quitApp: vi.fn(),
  requestStop: vi.fn(),   // replaces requestPreviewStop and requestSyncStop
  saveSettings: vi.fn(),
  startPreview: vi.fn(),
  startSync: vi.fn(),
  writeClientLog: vi.fn(),
}))
```

In `vi.mock('../lib/desktop', ...)`, replace the two stop entries with one:
```ts
vi.mock('../lib/desktop', () => ({
  detectShareFileDrives: desktopMocks.detectShareFileDrives,
  isDesktopRuntime: true,
  loadRunHistory: desktopMocks.loadRunHistory,
  loadSettings: desktopMocks.loadSettings,
  quitApp: desktopMocks.quitApp,
  requestStop: desktopMocks.requestStop,
  saveSettings: desktopMocks.saveSettings,
  startPreview: desktopMocks.startPreview,
  startSync: desktopMocks.startSync,
  writeClientLog: desktopMocks.writeClientLog,
}))
```

Find the test that sets up mock rejections for the stop functions (in `'persists settings, resets drafts, and reports command failures'`). Replace:
```ts
desktopMocks.requestPreviewStop.mockRejectedValue(new Error('preview stop failed'))
desktopMocks.requestSyncStop.mockRejectedValue(new Error('sync stop failed'))
```
With:
```ts
desktopMocks.requestStop.mockRejectedValue(new Error('stop failed'))
```

Update the two assertions that follow:
```ts
// Change:
expect(result.current.appError).toBe('preview stop failed')
// ...
expect(result.current.appError).toBe('sync stop failed')
// To:
expect(result.current.appError).toBe('stop failed')
// ...
expect(result.current.appError).toBe('stop failed')
```

- [ ] **Step 8: Build Rust**

```
cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: compiles without errors.

- [ ] **Step 9: Run frontend tests**

```
npm test -- run
```

Expected: all passing.

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/app.rs src-tauri/src/sync_engine.rs src/lib/desktop.ts src/hooks/useRuntime.ts src/hooks/useSyncRuntime.test.tsx
git commit -m "fix: remove dead preview_sync_plan command and merge redundant stop commands"
```

---

## Task 12 — Add configurable destination root (Section 5c)

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/sync_engine.rs`
- Modify: `src/types.ts`
- Modify: `src/lib/settings.ts`

- [ ] **Step 1: Add `destination_root` to `AppSettings` in `models.rs`**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub selected_drive: Option<String>,
    pub firmware_retention_enabled: bool,
    pub folders: BTreeMap<String, bool>,
    pub destination_root: Option<String>,  // new field
}
```

Update `AppSettings::default()` to include the new field:
```rust
impl Default for AppSettings {
    fn default() -> Self {
        let folders = FOLDER_DEFINITIONS
            .iter()
            .map(|(key, mandatory)| (key.to_string(), *mandatory))
            .collect();
        Self {
            selected_drive: None,
            firmware_retention_enabled: false,
            folders,
            destination_root: None,
        }
    }
}
```

- [ ] **Step 2: Update `build_plan_for_job` in `sync_engine.rs` to read from settings**

Replace the hardcoded `Path::new(r"C:\")`:
```rust
fn build_plan_for_job(
    settings: &AppSettings,
    stop_requested: &AtomicBool,
    event_target: Option<(&AppHandle, SyncEventScope)>,
) -> Result<SyncPlan, SyncError> {
    let normalized = settings.clone().normalized();
    let selected_drive = normalized
        .selected_drive
        .clone()
        .ok_or(SyncError::MissingDrive)?;
    let source_root = detection::build_source_root(&selected_drive);
    let destination_root = normalized
        .destination_root
        .as_deref()
        .unwrap_or(DESTINATION_ROOT);

    build_sync_plan_with_roots(
        &normalized,
        &selected_drive,
        &source_root,
        Path::new(destination_root),
        stop_requested,
        event_target,
    )
}
```

Update `run_sync` to pass the destination root from settings when calling `cleanup_empty_dirs` (around line 299–301). Replace:
```rust
for folder in enabled_folders(settings) {
    ensure_not_stopped(stop_requested)?;
    cleanup_empty_dirs(&PathBuf::from(DESTINATION_ROOT).join(folder))?;
}
```
With:
```rust
let destination_root = settings
    .destination_root
    .as_deref()
    .unwrap_or(DESTINATION_ROOT);
for folder in enabled_folders(settings) {
    ensure_not_stopped(stop_requested)?;
    cleanup_empty_dirs(&PathBuf::from(destination_root).join(folder))?;
}
```

Update `build_run_audit_record` to use the settings destination root instead of the constant:
```rust
fn build_run_audit_record(
    audit_context: &RunAuditContext,
    ...
) -> RunAuditRecord {
    RunAuditRecord {
        ...
        destination_root: audit_context.destination_root.clone(),
        ...
    }
}
```

Add `destination_root: String` to `RunAuditContext`:
```rust
struct RunAuditContext {
    enabled_folders: Vec<String>,
    firmware_retention_enabled: bool,
    selected_drive: Option<String>,
    source_root: Option<String>,
    started_at: String,
    destination_root: String,
}
```

Update `build_run_audit_context`:
```rust
fn build_run_audit_context(settings: &AppSettings) -> RunAuditContext {
    let selected_drive = settings.selected_drive.clone();
    RunAuditContext {
        enabled_folders: enabled_folders(settings),
        firmware_retention_enabled: settings.firmware_retention_enabled,
        selected_drive: selected_drive.clone(),
        source_root: selected_drive
            .as_ref()
            .map(|drive| detection::build_source_root(drive).display().to_string()),
        started_at: timestamp_now_ms(),
        destination_root: settings
            .destination_root
            .clone()
            .unwrap_or_else(|| DESTINATION_ROOT.to_string()),
    }
}
```

- [ ] **Step 3: Add `destinationRoot` to TypeScript `AppSettings`**

In `src/types.ts`, update the `AppSettings` interface:
```ts
export interface AppSettings {
  selectedDrive: string | null
  firmwareRetentionEnabled: boolean
  folders: Record<string, boolean>
  destinationRoot?: string | null
}
```

- [ ] **Step 4: Update `settings.ts`**

In `buildDefaultSettings`, add the field:
```ts
export function buildDefaultSettings(autoSelectedDrive: string | null = null): AppSettings {
  return {
    selectedDrive: autoSelectedDrive,
    firmwareRetentionEnabled: false,
    folders: folderDefinitions.reduce<Record<string, boolean>>((accumulator, folder) => {
      accumulator[folder.key] = folder.isMandatory
      return accumulator
    }, {}),
    destinationRoot: null,
  }
}
```

In `mergeSettings`, pass through the field:
```ts
return {
  selectedDrive: settings?.selectedDrive ?? defaults.selectedDrive,
  firmwareRetentionEnabled:
    settings?.firmwareRetentionEnabled ?? defaults.firmwareRetentionEnabled,
  folders: mergedFolders,
  destinationRoot: settings?.destinationRoot ?? null,
}
```

- [ ] **Step 5: Build Rust and run frontend tests**

```
cd src-tauri && cargo build 2>&1 | tail -20
```

```
cd .. && npm test -- run
```

Expected: both succeed.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/sync_engine.rs src/types.ts src/lib/settings.ts
git commit -m "feat: make destination root configurable via AppSettings (defaults to C:\\)"
```

---

## Task 13 — Folder definitions: single source of truth (Section 6)

**Files:**
- Modify: `src-tauri/src/models.rs`
- Modify: `src-tauri/src/app.rs`
- Modify: `src/lib/desktop.ts`
- Modify: `src/types.ts`
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/settings.test.ts`
- Modify: `src/hooks/useRuntime.ts`
- Modify: `src/hooks/useSyncRuntime.ts`
- Modify: `src/hooks/useSettings.ts`

### Rust side

- [ ] **Step 1: Add `FolderDefinition` struct to `models.rs`**

Add after the `FOLDER_DEFINITIONS` constant:

```rust
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderDefinition {
    pub key: String,
    pub is_mandatory: bool,
}
```

- [ ] **Step 2: Add `get_folder_definitions` command to `app.rs`**

Add the command function:
```rust
#[tauri::command]
pub fn get_folder_definitions() -> Vec<crate::models::FolderDefinition> {
    crate::models::FOLDER_DEFINITIONS
        .iter()
        .map(|(key, mandatory)| crate::models::FolderDefinition {
            key: key.to_string(),
            is_mandatory: *mandatory,
        })
        .collect()
}
```

Add `get_folder_definitions` to the `invoke_handler!` macro list.

### TypeScript side

- [ ] **Step 3: Add `getFolderDefinitions` to `desktop.ts`**

```ts
export async function getFolderDefinitions(): Promise<FolderDefinition[]> {
  if (isDesktopRuntime) {
    return invoke<FolderDefinition[]>('get_folder_definitions')
  }
  // Browser fallback: import the static list
  const { getFolderDefinitions: getStatic } = await import('./settings')
  return getStatic()
}
```

Add `FolderDefinition` to the import from `../types`.

- [ ] **Step 4: Update `settings.ts` — make `folderDefinitions` a parameter**

Update `buildDefaultSettings` to accept `folderDefinitions`:
```ts
export function buildDefaultSettings(
  folderDefinitions: FolderDefinition[],
  autoSelectedDrive: string | null = null,
): AppSettings {
  return {
    selectedDrive: autoSelectedDrive,
    firmwareRetentionEnabled: false,
    folders: folderDefinitions.reduce<Record<string, boolean>>((accumulator, folder) => {
      accumulator[folder.key] = folder.isMandatory
      return accumulator
    }, {}),
    destinationRoot: null,
  }
}
```

Update `mergeSettings` to accept `folderDefinitions`:
```ts
export function mergeSettings(
  folderDefinitions: FolderDefinition[],
  settings: Partial<AppSettings> | null | undefined,
  autoSelectedDrive: string | null = null,
): AppSettings {
  const defaults = buildDefaultSettings(folderDefinitions, autoSelectedDrive)
  const incomingFolders = settings?.folders ?? {}
  const mergedFolders = folderDefinitions.reduce<Record<string, boolean>>((accumulator, folder) => {
    const rawValue = incomingFolders[folder.key]
    accumulator[folder.key] =
      folder.isMandatory ? true : typeof rawValue === 'boolean' ? rawValue : defaults.folders[folder.key]
    return accumulator
  }, {})
  return {
    selectedDrive: settings?.selectedDrive ?? defaults.selectedDrive,
    firmwareRetentionEnabled: settings?.firmwareRetentionEnabled ?? defaults.firmwareRetentionEnabled,
    folders: mergedFolders,
    destinationRoot: settings?.destinationRoot ?? null,
  }
}
```

Update `areSettingsEqual` to accept `folderDefinitions`:
```ts
export function areSettingsEqual(
  folderDefinitions: FolderDefinition[],
  left: AppSettings,
  right: AppSettings,
) {
  if (left.selectedDrive !== right.selectedDrive) return false
  if (left.firmwareRetentionEnabled !== right.firmwareRetentionEnabled) return false
  return folderDefinitions.every((folder) => left.folders[folder.key] === right.folders[folder.key])
}
```

Keep `getFolderDefinitions()` exported from `settings.ts` for the browser fallback (used in `desktop.ts` above). The module-level `folderDefinitions` constant stays but is only used internally by `getFolderDefinitions()`.

- [ ] **Step 5: Update `settings.test.ts`**

Every call to `mergeSettings`, `buildDefaultSettings`, and `areSettingsEqual` in the test file needs `folderDefinitions` as the first argument. Import `getFolderDefinitions` and add it:

```ts
import { areSettingsEqual, buildDefaultSettings, getFolderDefinitions, mergeSettings } from './settings'
import type { FolderDefinition } from '../types'

const folderDefinitions: FolderDefinition[] = getFolderDefinitions()

describe('settings helpers', () => {
  it('forces mandatory folders on', () => {
    const merged = mergeSettings(folderDefinitions, {
      folders: { CUSPAPPS: false, TeamOSB: false },
    })
    expect(merged.folders.CUSPAPPS).toBe(true)
    expect(merged.folders.TeamOSB).toBe(true)
  })

  it('keeps the configured drive when present', () => {
    const merged = mergeSettings(folderDefinitions, { selectedDrive: 'S' }, 'Z')
    expect(merged.selectedDrive).toBe('S')
  })

  it('hydrates all known folders from defaults', () => {
    const defaults = buildDefaultSettings(folderDefinitions)
    const folderKeys = getFolderDefinitions().map((folder) => folder.key)
    expect(Object.keys(defaults.folders)).toEqual(folderKeys)
  })

  it('compares settings without relying on object serialization order', () => {
    const left = buildDefaultSettings(folderDefinitions, 'S')
    const right = {
      ...buildDefaultSettings(folderDefinitions, 'S'),
      folders: Object.fromEntries([...Object.entries(left.folders)].reverse()),
    }
    expect(areSettingsEqual(folderDefinitions, left, right)).toBe(true)
    expect(areSettingsEqual(folderDefinitions, left, { ...right, firmwareRetentionEnabled: true })).toBe(false)
  })
})
```

- [ ] **Step 6: Update `useRuntime.ts` — fetch definitions on init**

Add `getFolderDefinitions` to the `desktop` import.

Add `folderDefinitions` state:
```ts
const [folderDefinitions, setFolderDefinitions] = useState<FolderDefinition[]>([])
```

Inside the `init` Promise.all, add `getFolderDefinitions()`:
```ts
const [loadedSettings, detectedDrives, loadedHistory, loadedFolderDefs] = await Promise.all([
  loadSettings(),
  detectShareFileDrives(),
  loadRunHistory(),
  getFolderDefinitions(),
])
if (cancelled) return
setFolderDefinitions(loadedFolderDefs)
hydrateSettings(loadedSettings, detectedDrives.autoSelected, loadedFolderDefs)
initializeDrives(detectedDrives)
setHistoryRecords(loadedHistory)
```

Return `folderDefinitions` from the hook.

Update the `enabledFolderCount` useMemo to use folderDefinitions for the filter:
```ts
const enabledFolderCount = useMemo(
  () => folderDefinitions.filter((folder) => draftSettings.folders[folder.key]).length,
  [folderDefinitions, draftSettings.folders],
)
```

- [ ] **Step 7: Update `UseRuntimeOptions` and `hydrate` signature**

In `useSettings.ts`, update `hydrate` to accept `folderDefinitions`:
```ts
hydrate: (
  loadedSettings: AppSettings,
  autoSelectedDrive: string | null,
  folderDefinitions: FolderDefinition[],
) => void
```

Update the `hydrate` implementation:
```ts
const hydrate = (
  loadedSettings: AppSettings,
  autoSelectedDrive: string | null,
  folderDefinitions: FolderDefinition[],
) => {
  const merged = mergeSettings(folderDefinitions, loadedSettings, autoSelectedDrive)
  setSettings(merged)
  setDraftSettings(merged)
}
```

Update `UseRuntimeOptions.hydrateSettings` signature to match:
```ts
hydrateSettings: (
  loadedSettings: AppSettings,
  autoSelectedDrive: string | null,
  folderDefinitions: FolderDefinition[],
) => void
```

- [ ] **Step 8: Update `useSyncRuntime.ts` coordinator**

Remove the module-level `const folderDefinitions = getFolderDefinitions()`.

Pass `folderDefinitions` from the runtime into the return value:
```ts
// In the return:
folderDefinitions: runtime.folderDefinitions,
```

Update `handleApplySettings` to pass `folderDefinitions`:
```ts
const handleApplySettings = async () => {
  await settings.persistSettings(
    mergeSettings(runtime.folderDefinitions, settings.draftSettings, drive.driveInfo.autoSelected),
  )
}
```

Update `refreshDriveDetection` to pass `folderDefinitions`:
```ts
const refreshDriveDetection = async () => {
  setAppError(null)
  try {
    const detected = await detectShareFileDrives()
    const nextDrive = settings.draftSettings.selectedDrive || detected.autoSelected || null
    drive.initialize(detected)
    settings.setSelectedDrive(nextDrive)
  } catch (error) {
    setAppError(getErrorMessage(error, 'Unable to detect ShareFile drives.'))
  }
}
```

Update `useSettings` call to pass `folderDefinitions` reference through `hasUnsavedChanges`:
In `useSettings.ts`, update `hasUnsavedChanges` to pass folderDefinitions:
```ts
// useSettings needs folderDefinitions to compare — store it
// Add as option:
export interface UseSettingsOptions {
  onError: (message: string | null) => void
  onNotice: (message: string | null) => void
  folderDefinitions: FolderDefinition[]
}
```

Wait — `useSettings` initializes before `folderDefinitions` are loaded. Handle this: pass an empty array initially, update when loaded. Since `areSettingsEqual` is only called after hydration, this is safe.

Update `useSyncRuntime.ts` call:
```ts
const settings = useSettings({
  onError: setAppError,
  onNotice: setAppNotice,
  folderDefinitions: runtime.folderDefinitions,
})
```

But `runtime` is called after `settings`... this is a circular dependency.

**Resolution:** Move `folderDefinitions` state to the coordinator. The coordinator holds `[folderDefinitions, setFolderDefinitions]` and passes `setFolderDefinitions` to `useRuntime` as a callback. `useRuntime` calls it after loading.

Update `UseRuntimeOptions`:
```ts
onFolderDefinitionsLoaded: (defs: FolderDefinition[]) => void
```

In the coordinator:
```ts
const [folderDefinitions, setFolderDefinitions] = useState<FolderDefinition[]>([])
const settings = useSettings({ onError: setAppError, onNotice: setAppNotice, folderDefinitions })
const drive = useDriveDetection({ selectedDrive: settings.draftSettings.selectedDrive })
const runtime = useRuntime({
  ...,
  onFolderDefinitionsLoaded: setFolderDefinitions,
})
```

In `useRuntime.ts`, replace `folderDefinitions` state with a call to `onFolderDefinitionsLoaded`:
```ts
// Remove: const [folderDefinitions, setFolderDefinitions] = useState<FolderDefinition[]>([])
// In init, after loading:
onFolderDefinitionsLoaded(loadedFolderDefs)
```

Remove `folderDefinitions` from the `useRuntime` return value (it lives in the coordinator now).

- [ ] **Step 9: Build Rust**

```
cd src-tauri && cargo build 2>&1 | tail -20
```

Expected: no errors.

- [ ] **Step 10: Run all frontend tests**

```
cd .. && npm test -- run
```

Expected: all passing.

- [ ] **Step 11: Commit**

```bash
git add src-tauri/src/models.rs src-tauri/src/app.rs src/lib/desktop.ts src/types.ts src/lib/settings.ts src/lib/settings.test.ts src/hooks/useRuntime.ts src/hooks/useSettings.ts src/hooks/useSyncRuntime.ts
git commit -m "feat: folder definitions sourced from Rust via get_folder_definitions command"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by task |
|---|---|
| 4d — fix `getScopedTerminalEntries` | Task 1 ✓ |
| 4a — cap log arrays | Task 2 ✓ |
| 1 — hook split (`useSettings`) | Task 3 ✓ |
| 1 — hook split (`useDriveDetection`) | Task 4 ✓ |
| 1 — hook split (`useRuntime`) | Task 5 ✓ |
| 1 — coordinator | Task 6 ✓ |
| 2 — panel state co-location (Home) | Task 7 ✓ |
| 2 — panel state co-location (Preview) | Task 8 ✓ |
| 3 — drive dropdown UX | Tasks 4 + 9 ✓ |
| 4b — collapse duplicate history refresh | Task 5 (applied inline, `refreshHistoryFromRuntime` never added) ✓ |
| 4c — remove save side-effect | Task 10 ✓ |
| 5a — remove dead `preview_sync_plan` | Task 11 ✓ |
| 5b — merge stop commands | Task 11 ✓ |
| 5c — configurable destination root | Task 12 ✓ |
| 6 — folder definitions single source of truth | Task 13 ✓ |

**No placeholders found.** All tasks contain complete code.

**Type consistency confirmed:** `mergeSettings` signature change (Task 13) is propagated to all callers in `useSettings`, `useSyncRuntime`, and `settings.test.ts`. `areSettingsEqual` signature change is propagated to `useSettings`. `requestStop` rename is propagated to `useRuntime` and the test mock.
