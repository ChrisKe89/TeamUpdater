import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import './App.css'
import { buildDefaultSettings, getFolderDefinitions, mergeSettings } from './lib/settings'
import {
  detectShareFileDrives,
  isDesktopRuntime,
  loadRunHistory,
  loadSettings,
  previewSyncPlan,
  quitApp,
  requestSyncStop,
  saveSettings,
  startSync,
} from './lib/desktop'
import type {
  AppSettings,
  DetectDrivesResponse,
  FolderDefinition,
  NavView,
  RunAuditRecord,
  SyncEvent,
  SyncPlan,
  SyncPlanAction,
  SyncRunState,
} from './types'

const folderDefinitions = getFolderDefinitions()
const driveLetters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))

const initialRunState: SyncRunState = {
  isRunning: false,
  currentItem: null,
  itemProgress: 0,
  overallProgress: 0,
  copiedCount: 0,
  deletedCount: 0,
  transferLog: [],
  deletionLog: [],
  summary: null,
  lastMessage: 'Ready to sync.',
}

function App() {
  const [activeView, setActiveView] = useState<NavView>('home')
  const [driveInfo, setDriveInfo] = useState<DetectDrivesResponse>({
    candidates: [],
    autoSelected: null,
  })
  const [settings, setSettings] = useState<AppSettings>(buildDefaultSettings())
  const [draftSettings, setDraftSettings] = useState<AppSettings>(buildDefaultSettings())
  const [runState, setRunState] = useState<SyncRunState>(initialRunState)
  const [previewPlan, setPreviewPlan] = useState<SyncPlan | null>(null)
  const [historyRecords, setHistoryRecords] = useState<RunAuditRecord[]>([])
  const [appError, setAppError] = useState<string | null>(null)
  const [appNotice, setAppNotice] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)

  useEffect(() => {
    let cancelled = false

    const refreshHistoryFromRuntime = async () => {
      if (!isDesktopRuntime || cancelled) {
        return
      }

      try {
        const records = await loadRunHistory()
        if (!cancelled) {
          setHistoryRecords(records)
        }
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error, 'Unable to load run history.'))
        }
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false)
        }
      }
    }

    const init = async () => {
      try {
        const [loadedSettings, detectedDrives, loadedHistory] = await Promise.all([
          loadSettings(),
          detectShareFileDrives(),
          loadRunHistory(),
        ])

        if (cancelled) {
          return
        }

        const mergedSettings = mergeSettings(loadedSettings, detectedDrives.autoSelected)
        setDriveInfo(detectedDrives)
        setSettings(mergedSettings)
        setDraftSettings(mergedSettings)
        setHistoryRecords(loadedHistory)
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error, 'Unable to initialise the app.'))
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
          setRunState((previous) => reduceSyncEvent(previous, event.payload))

          if (
            event.payload.kind === 'run_completed' ||
            event.payload.kind === 'run_stopped' ||
            event.payload.kind === 'run_failed'
          ) {
            void refreshHistoryFromRuntime()
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
    if (!appNotice) {
      return
    }

    const timeoutId = window.setTimeout(() => setAppNotice(null), 2400)
    return () => window.clearTimeout(timeoutId)
  }, [appNotice])

  const selectedDrive = draftSettings.selectedDrive
  const selectableDrives = useMemo(() => {
    const detectedLetters = new Set(driveInfo.candidates.map((candidate) => candidate.letter))
    return driveLetters.map((letter) => ({
      letter,
      isReachable: detectedLetters.has(letter),
    }))
  }, [driveInfo.candidates])
  const selectedCandidate = useMemo(
    () => driveInfo.candidates.find((candidate) => candidate.letter === selectedDrive) ?? null,
    [driveInfo.candidates, selectedDrive],
  )
  const previewActions = useMemo(() => {
    const actions = previewPlan?.actions ?? []
    return {
      copies: actions.filter((action) => action.action === 'copy'),
      deletes: actions.filter((action) => action.action === 'delete'),
      skippedDeletes: actions.filter((action) => action.action === 'skip_delete'),
    }
  }, [previewPlan])

  const driveStatus = useMemo(() => {
    if (!selectedDrive) {
      return { tone: 'offline', label: 'Not connected' }
    }

    if (selectedCandidate?.isReachable) {
      return { tone: 'online', label: `Connected to ${selectedDrive}:\\` }
    }

    return { tone: 'offline', label: `${selectedDrive}:\\ unavailable` }
  }, [selectedCandidate, selectedDrive])

  const enabledFolderCount = useMemo(
    () => folderDefinitions.filter((folder) => draftSettings.folders[folder.key]).length,
    [draftSettings.folders],
  )

  const canStartSync =
    !isInitializing &&
    !runState.isRunning &&
    Boolean(selectedDrive) &&
    driveStatus.tone === 'online'

  const hasUnsavedChanges = JSON.stringify(settings) !== JSON.stringify(draftSettings)

  const persistSettings = async (nextSettings: AppSettings) => {
    setIsSaving(true)
    setAppError(null)
    setAppNotice(null)

    try {
      await saveSettings(nextSettings)
      setSettings(nextSettings)
      setDraftSettings(nextSettings)
      setAppNotice('Settings saved.')
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to save settings.'))
    } finally {
      setIsSaving(false)
    }
  }

  const refreshDriveDetection = async () => {
    setAppError(null)

    try {
      const detectedDrives = await detectShareFileDrives()
      const nextDrive = draftSettings.selectedDrive || detectedDrives.autoSelected || null

      setDriveInfo(detectedDrives)
      setDraftSettings((previous) => ({
        ...previous,
        selectedDrive: nextDrive,
      }))
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to detect ShareFile drives.'))
    }
  }

  const refreshHistory = async () => {
    if (!isDesktopRuntime) {
      return
    }

    setIsHistoryLoading(true)
    setAppError(null)

    try {
      const records = await loadRunHistory()
      setHistoryRecords(records)
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to load run history.'))
    } finally {
      setIsHistoryLoading(false)
    }
  }

  const handleFolderToggle = (folder: FolderDefinition) => {
    if (folder.isMandatory) {
      return
    }

    setDraftSettings((previous) => ({
      ...previous,
      folders: {
        ...previous.folders,
        [folder.key]: !previous.folders[folder.key],
      },
    }))
  }

  const handleFirmwareRetentionToggle = () => {
    setDraftSettings((previous) => ({
      ...previous,
      firmwareRetentionEnabled: !previous.firmwareRetentionEnabled,
    }))
  }

  const handlePreview = async () => {
    if (!canStartSync) {
      return
    }

    setIsPreviewing(true)
    setAppError(null)
    setAppNotice(null)

    try {
      const nextSettings = mergeSettings(draftSettings, driveInfo.autoSelected)
      const plan = await previewSyncPlan(nextSettings)
      setPreviewPlan(plan)
      setActiveView('preview')
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to build the sync preview.'))
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleStartSync = async () => {
    if (!canStartSync) {
      return
    }

    setAppError(null)
    setAppNotice(null)
    setRunState({
      ...initialRunState,
      isRunning: true,
      lastMessage: 'Sync queued.',
    })

    const nextSettings = mergeSettings(draftSettings, driveInfo.autoSelected)
    setSettings(nextSettings)
    setDraftSettings(nextSettings)

    try {
      await saveSettings(nextSettings)
      await startSync(nextSettings)
    } catch (error) {
      setRunState((previous) => ({
        ...previous,
        isRunning: false,
        lastMessage: getErrorMessage(error, 'Unable to start sync.'),
      }))
      setAppError(getErrorMessage(error, 'Unable to start sync.'))
    }
  }

  const handleStopSync = async () => {
    try {
      await requestSyncStop()
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to request stop.'))
    }
  }

  const handleQuit = async () => {
    if (runState.isRunning) {
      const shouldQuit = window.confirm(
        'A sync is currently running. Quit the app anyway?',
      )

      if (!shouldQuit) {
        return
      }
    }

    await quitApp()
  }

  const handleApplySettings = async () => {
    await persistSettings(mergeSettings(draftSettings, driveInfo.autoSelected))
  }

  const handleResetSettings = () => {
    setDraftSettings(settings)
    setAppError(null)
    setAppNotice(null)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Standalone Desktop Sync</p>
          <h1>TeamUpdater V3</h1>
          <p className="sidebar-copy">
            Mirror ShareFile folders to the local workstation with a single operator
            console.
          </p>
        </div>

        <nav className="nav">
          <NavButton
            active={activeView === 'home'}
            label="Home"
            onClick={() => setActiveView('home')}
          />
          <NavButton
            active={activeView === 'preview'}
            label="Preview"
            onClick={() => setActiveView('preview')}
          />
          <NavButton
            active={activeView === 'history'}
            label="History"
            onClick={() => {
              setActiveView('history')
              void refreshHistory()
            }}
          />
          <NavButton
            active={activeView === 'folder-selection'}
            label="Folder Selection"
            onClick={() => setActiveView('folder-selection')}
          />
          <NavButton
            active={activeView === 'firmware-retention'}
            label="Firmware Retention"
            onClick={() => setActiveView('firmware-retention')}
          />
        </nav>

        <div className="runtime-card">
          <span className="runtime-label">Runtime</span>
          <strong>{isDesktopRuntime ? 'Tauri desktop' : 'Browser preview'}</strong>
          <span className="runtime-copy">
            Browser mode can preview the UI, but sync actions require the Tauri backend.
          </span>
          {isDesktopRuntime ? (
            <button className="secondary-button sidebar-quit" onClick={() => void handleQuit()} type="button">
              Quit
            </button>
          ) : null}
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">ShareFile Connection</p>
            <div className="status-row">
              <span className={`status-pill status-pill--${driveStatus.tone}`}>
                <span className="status-dot" />
                {driveStatus.label}
              </span>
              <span className="hint-text">
                {driveInfo.candidates.length} candidate
                {driveInfo.candidates.length === 1 ? '' : 's'} detected
              </span>
            </div>
          </div>

          <div className="topbar-actions">
            <label className="field">
              <span>Drive letter</span>
              <select
                onChange={(event) =>
                  setDraftSettings((previous) => ({
                    ...previous,
                    selectedDrive: event.target.value || null,
                  }))
                }
                value={draftSettings.selectedDrive ?? ''}
              >
                <option value="">Select drive</option>
                {selectableDrives.map((candidate) => (
                  <option key={candidate.letter} value={candidate.letter}>
                    {candidate.letter}:\\ {candidate.isReachable ? 'reachable' : 'manual'}
                  </option>
                ))}
              </select>
            </label>

            <button className="ghost-button" onClick={refreshDriveDetection} type="button">
              Refresh drives
            </button>
          </div>
        </header>

        {appError ? <div className="banner banner--error">{appError}</div> : null}
        {appNotice ? <div className="banner banner--success">{appNotice}</div> : null}

        {isInitializing ? (
          <section className="panel panel--loading">
            <div className="spinner" />
            <p>Loading ShareFile configuration...</p>
          </section>
        ) : null}

        {!isInitializing && activeView === 'home' ? (
          <section className="view-grid view-grid--home">
            <div className="stats-grid">
              <StatCard
                detail="Mandatory folders stay enabled at all times."
                label="Selected folders"
                value={enabledFolderCount.toString()}
              />
              <StatCard
                detail={
                  previewPlan?.summary.totalCopyBytesLabel ??
                  runState.summary?.copiedBytesLabel ??
                  'Preview the next run to estimate transfer size'
                }
                label="Planned copies"
                value={
                  previewPlan?.summary.copyCount?.toString() ??
                  runState.summary?.plannedCopyFiles?.toString() ??
                  '0'
                }
              />
              <StatCard
                detail={
                  draftSettings.firmwareRetentionEnabled
                    ? 'Firmware retention enabled'
                    : 'Strict mirror mode'
                }
                label="Planned deletes"
                value={
                  previewPlan?.summary.deleteCount?.toString() ??
                  runState.summary?.plannedDeleteFiles?.toString() ??
                  '0'
                }
              />
              <StatCard
                detail={runState.lastMessage}
                label="Run state"
                value={runState.isRunning ? 'Running' : 'Idle'}
              />
            </div>

            <section className="panel highlight-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Current Transfer</p>
                  <h2>{runState.currentItem?.displayName ?? 'No active file transfer'}</h2>
                </div>
                <div className="percentage">{Math.round(runState.itemProgress)}%</div>
              </div>

              <p className="transfer-path">
                {runState.currentItem?.sourcePath ?? 'Start a sync to stream live progress.'}
              </p>

              <div className="progress-stack">
                <ProgressBar label="Current file" value={runState.itemProgress} />
                <ProgressBar label="Overall queue" value={runState.overallProgress} />
              </div>

              <div className="action-row">
                <button
                  className="ghost-button"
                  disabled={!canStartSync || isPreviewing}
                  onClick={handlePreview}
                  type="button"
                >
                  {isPreviewing ? 'Previewing...' : 'Preview changes'}
                </button>
                <button
                  className="primary-button"
                  disabled={!canStartSync}
                  onClick={handleStartSync}
                  type="button"
                >
                  Update
                </button>
                <button
                  className="secondary-button"
                  disabled={!runState.isRunning}
                  onClick={handleStopSync}
                  type="button"
                >
                  Stop
                </button>
              </div>
            </section>

            <section className="panel log-panel log-panel--compact">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Transfer Feed</p>
                  <h2>New files</h2>
                </div>
                <span className="counter-badge">{runState.copiedCount}</span>
              </div>
              <LogList
                emptyMessage="New and updated files will stream here during a sync."
                items={runState.transferLog}
              />
            </section>

            <section className="panel log-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Cleanup Feed</p>
                  <h2>Removed files</h2>
                </div>
                <span className="counter-badge">{runState.deletedCount}</span>
              </div>
              <LogList
                emptyMessage="Deleted files will stream here when the local mirror is cleaned."
                items={runState.deletionLog}
              />
            </section>
          </section>
        ) : null}

        {!isInitializing && activeView === 'preview' ? (
          <section className="settings-panel">
            <section className="panel preview-header">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Sync Preview</p>
                  <h2>{previewPlan ? 'Planned file actions' : 'No preview generated yet'}</h2>
                </div>
                <div className="action-row">
                  <button
                    className="ghost-button"
                    disabled={!canStartSync || isPreviewing}
                    onClick={handlePreview}
                    type="button"
                  >
                    {isPreviewing ? 'Refreshing...' : 'Refresh preview'}
                  </button>
                  <button
                    className="primary-button"
                    disabled={!canStartSync}
                    onClick={handleStartSync}
                    type="button"
                  >
                    Run update
                  </button>
                </div>
              </div>

              {previewPlan ? (
                <div className="stats-grid">
                  <StatCard
                    detail={previewPlan.summary.totalCopyBytesLabel}
                    label="Files to copy"
                    value={previewPlan.summary.copyCount.toString()}
                  />
                  <StatCard
                    detail="Files that exist locally but not in the source"
                    label="Files to delete"
                    value={previewPlan.summary.deleteCount.toString()}
                  />
                  <StatCard
                    detail={
                      previewPlan.firmwareRetentionEnabled
                        ? 'Retained by firmware protection'
                        : 'Disabled for this run'
                    }
                    label="Skipped deletes"
                    value={previewPlan.summary.skippedDeleteCount.toString()}
                  />
                  <StatCard
                    detail={`${previewPlan.selectedDrive}:\\ source`}
                    label="Generated"
                    value={formatTimestamp(previewPlan.generatedAt)}
                  />
                </div>
              ) : (
                <p className="empty-copy">
                  Generate a preview before running an update so you can verify copies,
                  deletions, and retained firmware paths.
                </p>
              )}
            </section>

            {previewPlan ? (
              <section className="view-grid">
                <PlanPanel
                  actions={previewActions.copies}
                  eyebrow="Incoming"
                  emptyMessage="No files need copying."
                  title="Files to copy"
                />
                <PlanPanel
                  actions={previewActions.deletes}
                  eyebrow="Cleanup"
                  emptyMessage="No files are queued for deletion."
                  title="Files to delete"
                />
                <PlanPanel
                  actions={previewActions.skippedDeletes}
                  eyebrow="Retained"
                  emptyMessage="No firmware-retained files in this run."
                  title="Skipped deletes"
                />
              </section>
            ) : null}
          </section>
        ) : null}

        {!isInitializing && activeView === 'history' ? (
          <section className="settings-panel">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Run History</p>
                  <h2>Persistent local audit trail</h2>
                </div>
                <button className="ghost-button" onClick={() => void refreshHistory()} type="button">
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

                    <div className="history-meta">
                      <span>Drive: {record.selectedDrive ? `${record.selectedDrive}:\\` : 'n/a'}</span>
                      <span>{record.enabledFolders.length} folders enabled</span>
                      <span>
                        Firmware retention:{' '}
                        {record.firmwareRetentionEnabled ? 'enabled' : 'disabled'}
                      </span>
                    </div>

                    <div className="history-stats">
                      <span>Copied: {record.summary.copiedFiles}</span>
                      <span>Deleted: {record.summary.deletedFiles}</span>
                      <span>Skipped deletes: {record.summary.skippedDeletes}</span>
                      <span>{record.summary.copiedBytesLabel || '0 bytes copied'}</span>
                    </div>

                    {record.errorMessage ? (
                      <div className="banner banner--error">{record.errorMessage}</div>
                    ) : null}

                    <LogList
                      emptyMessage="No recent actions were recorded for this run."
                      items={record.recentActions}
                    />
                  </article>
                ))}
              </div>
            </section>
          </section>
        ) : null}

        {!isInitializing && activeView === 'folder-selection' ? (
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Folder Selection</p>
                <h2>Choose mirrored folders</h2>
              </div>
              <span className="hint-text">{enabledFolderCount} enabled</span>
            </div>

            <div className="folder-list">
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
                onClick={handleApplySettings}
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
        ) : null}

        {!isInitializing && activeView === 'firmware-retention' ? (
          <section className="panel settings-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Firmware Retention</p>
                <h2>Protect `*\\Firmware\\*` deletes</h2>
              </div>
            </div>

            <button
              className={`retention-card ${draftSettings.firmwareRetentionEnabled ? 'is-on' : ''}`}
              onClick={handleFirmwareRetentionToggle}
              type="button"
            >
              <div>
                <strong>
                  {draftSettings.firmwareRetentionEnabled
                    ? 'Firmware retention enabled'
                    : 'Firmware retention disabled'}
                </strong>
                <p>
                  When enabled, local files inside folders named `Firmware` are preserved even if
                  the ShareFile source no longer contains them.
                </p>
              </div>
              <span className={`switch ${draftSettings.firmwareRetentionEnabled ? 'is-on' : ''}`}>
                <span className="switch-thumb" />
              </span>
            </button>

            <div className="action-row action-row--settings">
              <button
                className="primary-button"
                disabled={!hasUnsavedChanges || isSaving}
                onClick={handleApplySettings}
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
        ) : null}
      </main>
    </div>
  )
}

function NavButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button className={`nav-button ${active ? 'is-active' : ''}`} onClick={onClick} type="button">
      <strong>{label}</strong>
    </button>
  )
}

function StatCard({ detail, label, value }: { detail: string; label: string; value: string }) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
    </article>
  )
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="progress-bar">
      <div className="progress-labels">
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

function PlanPanel({
  actions,
  eyebrow,
  emptyMessage,
  title,
}: {
  actions: SyncPlanAction[]
  eyebrow: string
  emptyMessage: string
  title: string
}) {
  return (
    <section className="panel plan-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span className="counter-badge">{actions.length}</span>
      </div>
      {actions.length === 0 ? (
        <p className="empty-copy">{emptyMessage}</p>
      ) : (
        <div className="plan-list">
          {actions.map((action, index) => (
            <article className="plan-card" key={`${action.destinationPath}-${index}`}>
              <strong>{action.destinationPath}</strong>
              {action.sourcePath ? <span>Source: {action.sourcePath}</span> : null}
              <span>{action.reason}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function LogList({ emptyMessage, items }: { emptyMessage: string; items: string[] }) {
  if (items.length === 0) {
    return <p className="empty-copy">{emptyMessage}</p>
  }

  return (
    <ol className="log-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ol>
  )
}

function reduceSyncEvent(previous: SyncRunState, event: SyncEvent): SyncRunState {
  switch (event.kind) {
    case 'run_started':
      return { ...initialRunState, isRunning: true, lastMessage: event.message }
    case 'item_progress':
      return {
        ...previous,
        currentItem: { displayName: event.displayName, sourcePath: event.sourcePath },
        itemProgress: event.itemProgress,
        overallProgress: event.overallProgress,
        lastMessage: event.message,
      }
    case 'file_copied':
      return {
        ...previous,
        copiedCount: event.totalCopied,
        transferLog: [...previous.transferLog, event.destinationPath],
        lastMessage: event.message,
      }
    case 'file_deleted':
      return {
        ...previous,
        deletedCount: event.totalDeleted,
        deletionLog: [...previous.deletionLog, event.destinationPath],
        lastMessage: event.message,
      }
    case 'run_completed':
      return {
        ...previous,
        isRunning: false,
        itemProgress: 100,
        overallProgress: 100,
        summary: event.summary,
        lastMessage: event.message,
      }
    case 'run_stopped':
      return { ...previous, isRunning: false, summary: event.summary, lastMessage: event.message }
    case 'run_failed':
      return { ...previous, isRunning: false, lastMessage: event.message }
    default:
      return previous
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message
  }

  if (typeof error === 'string') {
    return error
  }

  return fallback
}

function formatTimestamp(value: string) {
  const timestamp = Number(value)

  if (Number.isNaN(timestamp) || timestamp <= 0) {
    return value
  }

  return new Date(timestamp).toLocaleString()
}

function statusTone(status: RunAuditRecord['status']) {
  return status === 'completed' ? 'online' : 'offline'
}

export default App
