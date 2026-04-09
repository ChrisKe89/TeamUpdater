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
                    <button className="utility-button" onClick={() => setIsHomeTerminalOpen(true)} type="button">
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
