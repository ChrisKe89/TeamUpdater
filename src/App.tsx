import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import './App.css'
import { buildDefaultSettings, getFolderDefinitions, mergeSettings } from './lib/settings'
import {
  detectShareFileDrives,
  isDesktopRuntime,
  loadSettings,
  requestSyncStop,
  saveSettings,
  startSync,
} from './lib/desktop'
import type {
  AppSettings,
  DetectDrivesResponse,
  FolderDefinition,
  NavView,
  SyncEvent,
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
  const [appError, setAppError] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const [loadedSettings, detectedDrives] = await Promise.all([
          loadSettings(),
          detectShareFileDrives(),
        ])

        if (cancelled) {
          return
        }

        const mergedSettings = mergeSettings(loadedSettings, detectedDrives.autoSelected)
        setDriveInfo(detectedDrives)
        setSettings(mergedSettings)
        setDraftSettings(mergedSettings)
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error, 'Unable to initialise the app.'))
        }
      } finally {
        if (!cancelled) {
          setIsInitializing(false)
        }
      }
    }

    const unlistenPromise = isDesktopRuntime
      ? listen<SyncEvent>('sync://event', (event) => {
          setRunState((previous) => reduceSyncEvent(previous, event.payload))
        })
      : Promise.resolve(() => undefined)

    void init()

    return () => {
      cancelled = true
      void unlistenPromise.then((unlisten) => unlisten())
    }
  }, [])

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

    try {
      await saveSettings(nextSettings)
      setSettings(nextSettings)
      setDraftSettings(nextSettings)
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

  const handleStartSync = async () => {
    if (!canStartSync) {
      return
    }

    setAppError(null)
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

  const handleApplySettings = async () => {
    await persistSettings(mergeSettings(draftSettings, driveInfo.autoSelected))
  }

  const handleResetSettings = () => {
    setDraftSettings(settings)
    setAppError(null)
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
          <NavButton active={activeView === 'home'} description="Run updates and watch live activity." label="Home" onClick={() => setActiveView('home')} />
          <NavButton active={activeView === 'folder-selection'} description="Choose which folders mirror to C:\\." label="Folder Selection" onClick={() => setActiveView('folder-selection')} />
          <NavButton active={activeView === 'firmware-retention'} description="Protect deletes under Firmware paths." label="Firmware Retention" onClick={() => setActiveView('firmware-retention')} />
        </nav>

        <div className="runtime-card">
          <span className="runtime-label">Runtime</span>
          <strong>{isDesktopRuntime ? 'Tauri desktop' : 'Browser preview'}</strong>
          <span className="runtime-copy">
            Browser mode can preview the UI, but sync actions require the Tauri backend.
          </span>
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

        {isInitializing ? (
          <section className="panel panel--loading">
            <div className="spinner" />
            <p>Loading ShareFile configuration…</p>
          </section>
        ) : null}

        {!isInitializing && activeView === 'home' ? (
          <section className="view-grid">
            <div className="stats-grid">
              <StatCard detail="Mandatory folders stay enabled at all times." label="Selected folders" value={enabledFolderCount.toString()} />
              <StatCard detail={runState.summary?.copiedBytesLabel ?? 'Awaiting next sync run'} label="New or updated files" value={runState.copiedCount.toString()} />
              <StatCard detail={draftSettings.firmwareRetentionEnabled ? 'Firmware retention enabled' : 'Strict mirror mode'} label="Removed files" value={runState.deletedCount.toString()} />
              <StatCard detail={runState.lastMessage} label="Run state" value={runState.isRunning ? 'Running' : 'Idle'} />
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
                <button className="primary-button" disabled={!canStartSync} onClick={handleStartSync} type="button">
                  Update
                </button>
                <button className="secondary-button" disabled={!runState.isRunning} onClick={handleStopSync} type="button">
                  Stop
                </button>
              </div>
            </section>

            <section className="panel log-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Transfer Feed</p>
                  <h2>New files</h2>
                </div>
                <span className="counter-badge">{runState.copiedCount}</span>
              </div>
              <LogList emptyMessage="New and updated files will stream here during a sync." items={runState.transferLog} />
            </section>

            <section className="panel log-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Cleanup Feed</p>
                  <h2>Removed files</h2>
                </div>
                <span className="counter-badge">{runState.deletedCount}</span>
              </div>
              <LogList emptyMessage="Deleted files will stream here when the local mirror is cleaned." items={runState.deletionLog} />
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
                  <span>
                    <strong>{folder.label}</strong>
                    <small>
                      Source: [Drive]\Folders\FBAU-PWS\DATA\For Laptops\CUSP\CUSP-Data\
                      {folder.label}
                    </small>
                  </span>
                  <span className={`switch ${draftSettings.folders[folder.key] ? 'is-on' : ''}`}>
                    <span className="switch-thumb" />
                  </span>
                </button>
              ))}
            </div>

            <div className="action-row action-row--settings">
              <button className="primary-button" disabled={!hasUnsavedChanges || isSaving} onClick={handleApplySettings} type="button">
                Apply
              </button>
              <button className="secondary-button" disabled={!hasUnsavedChanges || isSaving} onClick={handleResetSettings} type="button">
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
              <button className="primary-button" disabled={!hasUnsavedChanges || isSaving} onClick={handleApplySettings} type="button">
                Apply
              </button>
              <button className="secondary-button" disabled={!hasUnsavedChanges || isSaving} onClick={handleResetSettings} type="button">
                Cancel
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  )
}

function NavButton({ active, description, label, onClick }: { active: boolean; description: string; label: string; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? 'is-active' : ''}`} onClick={onClick} type="button">
      <strong>{label}</strong>
      <span>{description}</span>
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

export default App
