import { useState } from 'react'
import './App.css'
import { NavButton } from './components/app-panels'
import { useSyncRuntime } from './hooks/useSyncRuntime'
import { HomeView } from './views/HomeView'
import { PreviewView } from './views/PreviewView'
import { HistoryView } from './views/HistoryView'
import { FolderSelectionView } from './views/FolderSelectionView'
import { FirmwareRetentionView } from './views/FirmwareRetentionView'

function App() {
  const runtime = useSyncRuntime()
  const [isTransferFeedOpen, setIsTransferFeedOpen] = useState(false)
  const [isCleanupFeedOpen, setIsCleanupFeedOpen] = useState(false)
  const [isHomeTerminalOpen, setIsHomeTerminalOpen] = useState(false)
  const [isPreviewSummaryOpen, setIsPreviewSummaryOpen] = useState(true)
  const [isPreviewTerminalOpen, setIsPreviewTerminalOpen] = useState(false)
  const [isPreviewCopiesOpen, setIsPreviewCopiesOpen] = useState(true)
  const [isPreviewDeletesOpen, setIsPreviewDeletesOpen] = useState(false)
  const [isPreviewSkippedOpen, setIsPreviewSkippedOpen] = useState(false)
  const homeTerminalOpen = isHomeTerminalOpen || runtime.runtimePhase === 'running'
  const transferFeedOpen = isTransferFeedOpen && runtime.transferFeedItems.length > 0
  const cleanupFeedOpen = isCleanupFeedOpen && runtime.cleanupFeedItems.length > 0

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
          <button className="utility-button utility-button--ghost sidebar-quit" onClick={() => void runtime.handleQuit()} type="button">
            Quit
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Console Status</p>
            <h2>ShareFile operator console</h2>
            <div className="status-row">
              <span className={`status-pill status-pill--${runtime.driveStatus.tone}`}>
                <span className="status-dot" />
                {runtime.driveStatus.label}
              </span>
              <span className={`status-pill status-pill--${runtime.runtimeBadgeTone}`}>
                <span className="status-dot" />
                {runtime.runtimeStatusLabel}
              </span>
            </div>
          </div>

          <div className="topbar-actions">
            <label className="field">
              <span>Drive letter</span>
              <select
                onChange={(event) => runtime.setSelectedDrive(event.target.value || null)}
                value={runtime.draftSettings.selectedDrive ?? ''}
              >
                <option value="">Select drive</option>
                {runtime.selectableDrives.map((candidate) => (
                  <option key={candidate.letter} value={candidate.letter}>
                    {candidate.letter}:\\ {candidate.isReachable ? 'reachable' : 'manual'}
                  </option>
                ))}
              </select>
            </label>

            <button
              className="secondary-button"
              onClick={() => void runtime.refreshDriveDetection()}
              type="button"
            >
              Refresh drives
            </button>
          </div>
        </header>

        {runtime.topLevelAppError ? (
          <div className="banner banner--error">{runtime.topLevelAppError}</div>
        ) : null}
        {runtime.appNotice ? <div className="banner banner--success">{runtime.appNotice}</div> : null}

        {runtime.isInitializing ? (
          <section className="panel panel--loading">
            <div className="spinner" />
            <p>Loading ShareFile configuration...</p>
          </section>
        ) : null}

        {!runtime.isInitializing && runtime.activeView === 'home' ? (
          <HomeView
            canStartSync={runtime.canStartSync}
            cleanupFeedItems={runtime.cleanupFeedItems}
            copiedCount={runtime.runState.copiedCount}
            deletedCount={runtime.runState.deletedCount}
            homeCounts={runtime.homeCounts}
            homePanelClassName={runtime.homePanelClassName}
            isCleanupFeedOpen={cleanupFeedOpen}
            isHomeTerminalOpen={homeTerminalOpen}
            isPreviewing={runtime.isPreviewing}
            isTransferFeedOpen={transferFeedOpen}
            onPreview={runtime.handlePreview}
            onRetry={runtime.handleRetryRuntimeAction}
            onStartSync={runtime.handleStartSync}
            onStop={runtime.runtimeScope === 'preview' ? runtime.handleStopPreview : runtime.handleStopSync}
            onToggleCleanupFeed={() => setIsCleanupFeedOpen((previous) => !previous)}
            onToggleHomeTerminal={() => setIsHomeTerminalOpen((previous) => !previous)}
            onToggleTransferFeed={() => setIsTransferFeedOpen((previous) => !previous)}
            onViewLogs={() => setIsHomeTerminalOpen(true)}
            onViewResults={runtime.handleViewResults}
            previewStatusMessage={runtime.previewStatusMessage}
            processedCount={runtime.processedCount}
            processedTotal={runtime.processedTotal}
            runState={runtime.runState}
            runtimeCanViewResults={runtime.runtimeCanViewResults}
            runtimeCurrentDetail={runtime.runtimeCurrentDetail}
            runtimeCurrentTitle={runtime.runtimeCurrentTitle}
            runtimeError={runtime.runtimeError}
            runtimeErrorTitle={runtime.runtimeErrorTitle}
            runtimeHeadline={runtime.runtimeHeadline}
            runtimePhase={runtime.runtimePhase}
            runtimeScope={runtime.runtimeScope}
            syncTerminalEntries={runtime.syncTerminalEntries}
            transferFeedItems={runtime.transferFeedItems}
          />
        ) : null}

        {!runtime.isInitializing && runtime.activeView === 'preview' ? (
          <PreviewView
            canStartSync={runtime.canStartSync}
            isPreviewCopiesOpen={isPreviewCopiesOpen}
            isPreviewDeletesOpen={isPreviewDeletesOpen}
            isPreviewing={runtime.isPreviewing}
            isPreviewSkippedOpen={isPreviewSkippedOpen}
            isPreviewSummaryOpen={isPreviewSummaryOpen}
            isPreviewTerminalOpen={isPreviewTerminalOpen}
            onPreview={runtime.handlePreview}
            onRetry={runtime.handleRetryRuntimeAction}
            onStartSync={runtime.handleStartSync}
            onStopPreview={runtime.handleStopPreview}
            onTogglePreviewCopies={() => setIsPreviewCopiesOpen((previous) => !previous)}
            onTogglePreviewDeletes={() => setIsPreviewDeletesOpen((previous) => !previous)}
            onTogglePreviewSkipped={() => setIsPreviewSkippedOpen((previous) => !previous)}
            onTogglePreviewSummary={() => setIsPreviewSummaryOpen((previous) => !previous)}
            onTogglePreviewTerminal={() => setIsPreviewTerminalOpen((previous) => !previous)}
            onViewLogs={() => setIsPreviewTerminalOpen(true)}
            previewActions={runtime.previewActions}
            previewCopyDetail={runtime.previewCopyDetail}
            previewPlan={runtime.previewPlan}
            previewStatusMessage={runtime.previewStatusMessage}
            previewTerminalEntries={runtime.previewTerminalEntries}
            runtimeBadgeTone={runtime.runtimeBadgeTone}
            runtimePhase={runtime.runtimePhase}
            runtimeScope={runtime.runtimeScope}
            runtimeStatusLabel={runtime.runtimeStatusLabel}
          />
        ) : null}

        {!runtime.isInitializing && runtime.activeView === 'history' ? (
          <HistoryView
            historyRecords={runtime.historyRecords}
            isHistoryLoading={runtime.isHistoryLoading}
            onRefreshHistory={runtime.refreshHistory}
          />
        ) : null}

        {!runtime.isInitializing && runtime.activeView === 'folder-selection' ? (
          <FolderSelectionView
            appNotice={runtime.appNotice}
            draftSettings={runtime.draftSettings}
            enabledFolderCount={runtime.enabledFolderCount}
            folderDefinitions={runtime.folderDefinitions}
            hasUnsavedChanges={runtime.hasUnsavedChanges}
            isSaving={runtime.isSaving}
            onApply={runtime.handleApplySettings}
            onReset={runtime.handleResetSettings}
            onToggleFolder={runtime.handleFolderToggle}
          />
        ) : null}

        {!runtime.isInitializing && runtime.activeView === 'firmware-retention' ? (
          <FirmwareRetentionView
            firmwareRetentionEnabled={runtime.draftSettings.firmwareRetentionEnabled}
            hasUnsavedChanges={runtime.hasUnsavedChanges}
            isSaving={runtime.isSaving}
            onApply={runtime.handleApplySettings}
            onReset={runtime.handleResetSettings}
            onToggleRetention={runtime.handleFirmwareRetentionToggle}
          />
        ) : null}
      </main>
    </div>
  )
}

export default App
