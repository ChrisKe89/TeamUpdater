import { useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import './App.css'
import { buildDefaultSettings, getFolderDefinitions, mergeSettings } from './lib/settings'
import {
  detectShareFileDrives,
  isDesktopRuntime,
  loadRunHistory,
  loadSettings,
  quitApp,
  requestPreviewStop,
  requestSyncStop,
  saveSettings,
  startPreview,
  startSync,
} from './lib/desktop'
import type {
  AppSettings,
  DetectDrivesResponse,
  FolderDefinition,
  NavView,
  RunAuditRecord,
  SyncEvent,
  SyncEventScope,
  SyncPlan,
  SyncPlanAction,
  SyncRunState,
  TerminalEntry,
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

const TERMINAL_LOG_LIMIT = 400

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
  const [previewStatusMessage, setPreviewStatusMessage] = useState('Ready to generate a preview.')
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([])
  const [activeTerminalScope, setActiveTerminalScope] = useState<SyncEventScope | null>(null)
  const [isTransferFeedOpen, setIsTransferFeedOpen] = useState(false)
  const [isCleanupFeedOpen, setIsCleanupFeedOpen] = useState(false)
  const [isHomeTerminalOpen, setIsHomeTerminalOpen] = useState(false)
  const [isPreviewSummaryOpen, setIsPreviewSummaryOpen] = useState(true)
  const [isPreviewTerminalOpen, setIsPreviewTerminalOpen] = useState(false)
  const [isPreviewCopiesOpen, setIsPreviewCopiesOpen] = useState(true)
  const [isPreviewDeletesOpen, setIsPreviewDeletesOpen] = useState(false)
  const [isPreviewSkippedOpen, setIsPreviewSkippedOpen] = useState(false)

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
          const payload = event.payload

          switch (payload.kind) {
            case 'preview_started':
              setIsPreviewing(true)
              setActiveTerminalScope('preview')
              setPreviewStatusMessage(payload.message)
              setTerminalEntries([])
              return
            case 'preview_completed':
              setIsPreviewing(false)
              setPreviewPlan(payload.plan)
              setActiveView('preview')
              setPreviewStatusMessage(payload.message)
              return
            case 'preview_stopped':
              setIsPreviewing(false)
              setPreviewStatusMessage(payload.message)
              return
            case 'preview_failed':
              setIsPreviewing(false)
              setPreviewStatusMessage(payload.message)
              setAppError(payload.message)
              return
            case 'log_line':
              setTerminalEntries((previous) => appendTerminalEntry(previous, payload))
              setActiveTerminalScope(payload.scope)
              return
            default:
              setRunState((previous) => reduceSyncEvent(previous, payload))

              if (payload.kind === 'run_started') {
                setActiveTerminalScope('sync')
                setTerminalEntries([])
              }

              if (payload.kind === 'run_failed') {
                setAppError(payload.message)
              }

              if (
                payload.kind === 'run_completed' ||
                payload.kind === 'run_stopped' ||
                payload.kind === 'run_failed'
              ) {
                void refreshHistoryFromRuntime()
              }
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
    !isPreviewing &&
    Boolean(selectedDrive) &&
    driveStatus.tone === 'online'

  const hasUnsavedChanges = JSON.stringify(settings) !== JSON.stringify(draftSettings)
  const visibleTerminalEntries = useMemo(
    () =>
      activeTerminalScope
        ? terminalEntries.filter((entry) => entry.scope === activeTerminalScope)
        : terminalEntries,
    [activeTerminalScope, terminalEntries],
  )
  const syncTerminalEntries = useMemo(
    () => visibleTerminalEntries.filter((entry) => entry.scope === 'sync'),
    [visibleTerminalEntries],
  )
  const previewTerminalEntries = useMemo(
    () => visibleTerminalEntries.filter((entry) => entry.scope === 'preview'),
    [visibleTerminalEntries],
  )
  const transferFeedItems = useMemo(() => {
    const terminalCopies = syncTerminalEntries
      .map((entry) => entry.line)
      .filter((line) => line.startsWith('Copying '))

    return dedupePreserveOrder([
      ...runState.transferLog,
      ...terminalCopies,
    ])
  }, [runState.transferLog, syncTerminalEntries])
  const cleanupFeedItems = useMemo(() => {
    const terminalDeletes = syncTerminalEntries
      .map((entry) => entry.line)
      .filter((line) => line.startsWith('Removing ') || line.startsWith('Removed '))

    return dedupePreserveOrder([
      ...runState.deletionLog,
      ...terminalDeletes,
    ])
  }, [runState.deletionLog, syncTerminalEntries])

  const homeCounts = useMemo(
    () => [
      { label: 'Selected folders', value: enabledFolderCount.toString() },
      {
        label: 'Planned copies',
        value:
          previewPlan?.summary.copyCount?.toString() ??
          runState.summary?.plannedCopyFiles?.toString() ??
          '0',
      },
      {
        label: 'Planned deletes',
        value:
          previewPlan?.summary.deleteCount?.toString() ??
          runState.summary?.plannedDeleteFiles?.toString() ??
          '0',
      },
    ],
    [enabledFolderCount, previewPlan, runState.summary],
  )
  const homeTransferTitle =
    runState.currentItem?.displayName ?? (runState.isRunning ? 'Preparing transfer' : 'No active transfer')
  const homeTransferDetail =
    runState.currentItem?.sourcePath ?? (runState.isRunning ? runState.lastMessage : 'Run preview or update to start a transfer.')
  const homeStatusLabel = runState.isRunning ? 'Sync active' : 'Idle'
  const previewCopyDetail = previewPlan ? `${previewPlan.summary.totalCopyBytesLabel} to copy` : undefined

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
    setPreviewStatusMessage('Preview queued.')
    setActiveTerminalScope('preview')
    setTerminalEntries([])

    try {
      const nextSettings = mergeSettings(draftSettings, driveInfo.autoSelected)
      setActiveView('preview')
      setPreviewPlan(null)
      await startPreview(nextSettings)
    } catch (error) {
      setIsPreviewing(false)
      setPreviewStatusMessage(getErrorMessage(error, 'Unable to build the sync preview.'))
      setAppError(getErrorMessage(error, 'Unable to build the sync preview.'))
    }
  }

  const handleStopPreview = async () => {
    try {
      await requestPreviewStop()
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to request preview stop.'))
    }
  }

  const handleStartSync = async () => {
    if (!canStartSync) {
      return
    }

    setAppError(null)
    setAppNotice(null)
    setActiveTerminalScope('sync')
    setTerminalEntries([])
    setPreviewStatusMessage('Ready to generate a preview.')
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
    if (runState.isRunning || isPreviewing) {
      const shouldQuit = window.confirm(
        'A preview or sync is currently running. Quit the app anyway?',
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
        <div className="sidebar-top">
          <div>
            <h1>TeamUpdater V3</h1>
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
        </div>

        <div className="sidebar-footer">
          {isDesktopRuntime ? (
            <button
              className="utility-button utility-button--ghost sidebar-quit"
              onClick={() => void handleQuit()}
              type="button"
            >
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

            <button className="secondary-button" onClick={refreshDriveDetection} type="button">
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
            <section className="panel highlight-panel">
              <div className="progress-module-header">
                <div className="progress-module-copy">
                  <span className="section-kicker">Current transfer</span>
                  <h2>{homeTransferTitle}</h2>
                  <p className="transfer-path">{homeTransferDetail}</p>
                </div>
                <div className="progress-module-summary">
                  <span className={`status-pill status-pill--${runState.isRunning ? 'online' : 'offline'}`}>
                    <span className="status-dot" />
                    {homeStatusLabel}
                  </span>
                  <div className="percentage-block">
                    <span>Overall</span>
                    <strong>{formatProgress(runState.overallProgress)}%</strong>
                  </div>
                </div>
              </div>

              <div className="inline-stats">
                {homeCounts.map((item) => (
                  <div className="inline-stat" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                ))}
              </div>

              <div className="progress-stack">
                <ProgressBar label="Current file" value={runState.itemProgress} />
                <ProgressBar label="Overall queue" value={runState.overallProgress} />
              </div>

              <div className="action-row">
                <button
                  className="secondary-button"
                  disabled={!canStartSync || isPreviewing}
                  onClick={handlePreview}
                  type="button"
                >
                  {isPreviewing ? 'Running preview...' : 'Run preview'}
                </button>
                <button
                  className="primary-button"
                  disabled={!canStartSync}
                  onClick={handleStartSync}
                  type="button"
                >
                  Run update
                </button>
                <button
                  className="utility-button utility-button--danger"
                  disabled={!runState.isRunning}
                  onClick={handleStopSync}
                  type="button"
                >
                  Stop
                </button>
              </div>
            </section>

            <TerminalPanel
              entries={syncTerminalEntries}
              isCollapsible
              isOpen={isHomeTerminalOpen}
              onCancel={runState.isRunning ? handleStopSync : undefined}
              onToggle={() => setIsHomeTerminalOpen((previous) => !previous)}
              status={runState.lastMessage}
              title="Execution terminal"
            />

            <CollapsibleLogPanel
              count={Math.max(runState.copiedCount, transferFeedItems.length)}
              emptyDetail="Run preview or update to populate this list."
              emptyTitle="No files copied yet"
              eyebrow="Transfer Feed"
              isOpen={isTransferFeedOpen}
              items={transferFeedItems}
              onToggle={() => setIsTransferFeedOpen((previous) => !previous)}
              title="New files"
            />

            <CollapsibleLogPanel
              count={Math.max(runState.deletedCount, cleanupFeedItems.length)}
              emptyDetail="Cleanup activity will appear here during update runs."
              emptyTitle="No files removed yet"
              eyebrow="Cleanup Feed"
              isOpen={isCleanupFeedOpen}
              items={cleanupFeedItems}
              onToggle={() => setIsCleanupFeedOpen((previous) => !previous)}
              title="Removed files"
            />
          </section>
        ) : null}

        {!isInitializing && activeView === 'preview' ? (
          <section className="settings-panel">
            <section
              className={`panel preview-header ${isPreviewSummaryOpen ? 'is-open' : 'is-collapsed'}`.trim()}
            >
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Sync Preview</p>
                  <h2>{previewPlan ? 'Planned file actions' : 'No preview generated yet'}</h2>
                </div>
                <div className="panel-actions">
                  <button
                    className="secondary-button"
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
                    detail={previewCopyDetail}
                    label="Files to copy"
                    value={previewPlan.summary.copyCount.toString()}
                  />
                  <StatCard
                    detail="Queued for deletion"
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
              ) : null}

              {isPreviewSummaryOpen && !previewPlan ? (
                <EmptyState
                  detail="Run preview to inspect copies, deletions, and retained firmware paths."
                  title="No preview available"
                />
              ) : null}
            </section>

            <TerminalPanel
              entries={previewTerminalEntries}
              isCollapsible
              isOpen={isPreviewTerminalOpen}
              onCancel={isPreviewing ? handleStopPreview : undefined}
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
        ) : null}

        {!isInitializing && activeView === 'history' ? (
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
                      <span className="history-chip">
                        {record.enabledFolders.length} folders enabled
                      </span>
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

function StatCard({ detail, label, value }: { detail?: string; label: string; value: string }) {
  return (
    <article className="stat-card">
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  )
}

function ProgressBar({ label, value }: { label: string; value: number }) {
  const safeValue = clampProgress(value)

  return (
    <div className="progress-bar">
      <div className="progress-labels">
        <span>{label}</span>
        <span>{formatProgress(safeValue)}%</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  )
}

function PlanPanel({
  actions,
  className,
  eyebrow,
  emptyDetail,
  emptyTitle,
  isOpen,
  onToggle,
  title,
}: {
  actions: SyncPlanAction[]
  className?: string
  eyebrow: string
  emptyDetail: string
  emptyTitle: string
  isOpen: boolean
  onToggle: () => void
  title: string
}) {
  return (
    <section
      className={`panel plan-panel ${className ?? ''} ${isOpen ? 'is-open' : 'is-collapsed'}`.trim()}
    >
      <div className="panel-heading">
        <button
          aria-expanded={isOpen}
          className="section-toggle"
          onClick={onToggle}
          type="button"
        >
          <span className="section-kicker">{eyebrow}</span>
          <h2>{title}</h2>
        </button>
        <div className="panel-actions">
          <span className="counter-badge">{actions.length}</span>
          <CollapseButton isOpen={isOpen} onToggle={onToggle} title={`Toggle ${title}`} />
        </div>
      </div>
      {!isOpen ? null : actions.length === 0 ? (
        <EmptyState detail={emptyDetail} title={emptyTitle} />
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

function TerminalPanel({
  entries,
  isCollapsible = false,
  isOpen = true,
  onCancel,
  onToggle,
  status,
  title,
}: {
  entries: TerminalEntry[]
  isCollapsible?: boolean
  isOpen?: boolean
  onCancel?: () => void
  onToggle?: () => void
  status: string
  title: string
}) {
  const isExpanded = !isCollapsible || isOpen
  const terminalWindowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isExpanded || !terminalWindowRef.current) {
      return
    }

    terminalWindowRef.current.scrollTop = terminalWindowRef.current.scrollHeight
  }, [entries, isExpanded])

  return (
    <section className={`panel terminal-panel ${isExpanded ? 'is-open' : 'is-collapsed'}`.trim()}>
      <div className="panel-heading">
        {isCollapsible ? (
          <button
            aria-expanded={isExpanded}
            className="section-toggle"
            onClick={onToggle}
            type="button"
          >
            <span className="section-kicker">Verbose output</span>
            <h2>{title}</h2>
          </button>
        ) : (
          <div>
            <span className="section-kicker">Verbose output</span>
            <h2>{title}</h2>
          </div>
        )}
        <div className="panel-actions">
          {onCancel ? (
            <button className="utility-button utility-button--danger" onClick={onCancel} type="button">
              Cancel
            </button>
          ) : null}
          {isCollapsible ? (
            <CollapseButton isOpen={isExpanded} onToggle={onToggle} title={`Toggle ${title}`} />
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        <>
          <p className="terminal-status">{status}</p>

          <div className="terminal-window" ref={terminalWindowRef} role="log" aria-live="polite">
            {entries.length === 0 ? (
              <EmptyState
                detail="Logs will appear here when preview or update starts."
                title="No terminal output yet"
              />
            ) : (
              entries.map((entry, index) => (
                <div className="terminal-line" key={`${entry.timestamp}-${index}`}>
                  <span className="terminal-timestamp">{entry.timestamp}</span>
                  <span>{entry.line}</span>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  )
}

function CollapsibleLogPanel({
  count,
  emptyDetail,
  emptyTitle,
  eyebrow,
  isOpen,
  items,
  onToggle,
  title,
}: {
  count: number
  emptyDetail: string
  emptyTitle: string
  eyebrow: string
  isOpen: boolean
  items: string[]
  onToggle: () => void
  title: string
}) {
  return (
    <section className={`panel log-panel ${isOpen ? 'is-open' : 'is-collapsed'}`.trim()}>
      <div className="panel-heading">
        <button
          aria-expanded={isOpen}
          className="section-toggle"
          onClick={onToggle}
          type="button"
        >
          <span className="section-kicker">{eyebrow}</span>
          <h2>{title}</h2>
        </button>
        <div className="panel-actions">
          <span className="counter-badge">{count}</span>
          <CollapseButton isOpen={isOpen} onToggle={onToggle} title={`Toggle ${title}`} />
        </div>
      </div>
      {isOpen ? <LogList emptyDetail={emptyDetail} emptyTitle={emptyTitle} items={items} /> : null}
    </section>
  )
}

function CollapseButton({
  isOpen,
  onToggle,
  title,
}: {
  isOpen: boolean
  onToggle?: () => void
  title: string
}) {
  return (
    <button
      aria-expanded={isOpen}
      aria-label={title}
      className="utility-button utility-button--icon"
      onClick={onToggle}
      title={title}
      type="button"
    >
      {isOpen ? '▾' : '▸'}
    </button>
  )
}

function EmptyState({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

function LogList({
  emptyDetail,
  emptyTitle,
  items,
}: {
  emptyDetail: string
  emptyTitle: string
  items: string[]
}) {
  if (items.length === 0) {
    return <EmptyState detail={emptyDetail} title={emptyTitle} />
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

function appendTerminalEntry(previous: TerminalEntry[], event: Extract<SyncEvent, { kind: 'log_line' }>) {
  const nextEntry: TerminalEntry = {
    scope: event.scope,
    line: event.line,
    timestamp: new Date().toLocaleTimeString(),
  }

  return [...previous, nextEntry].slice(-TERMINAL_LOG_LIMIT)
}

function formatTimestamp(value: string) {
  const timestamp = Number(value)

  if (Number.isNaN(timestamp) || timestamp <= 0) {
    return value
  }

  return new Date(timestamp).toLocaleString()
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, value))
}

function formatProgress(value: number) {
  return Math.round(clampProgress(value))
}

function dedupePreserveOrder(items: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of items) {
    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

function statusTone(status: RunAuditRecord['status']) {
  return status === 'completed' ? 'online' : 'offline'
}

export default App
