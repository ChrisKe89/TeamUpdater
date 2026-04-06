import { useState } from 'react'
import { CollapsibleLogPanel, ProgressBar, TerminalPanel } from '../components/app-panels'
import { formatProgress } from '../lib/runtime'

export interface HomeViewProps {
  canStartSync: boolean
  cleanupFeedItems: string[]
  copiedCount: number
  deletedCount: number
  homeCounts: { label: string; value: string }[]
  homePanelClassName: string
  isPreviewing: boolean
  onPreview: () => Promise<void>
  onRetry: () => Promise<void>
  onStartSync: () => Promise<void>
  onStop: () => Promise<void>
  onViewResults: () => void
  processedCount: number
  processedTotal: number
  runState: {
    isRunning: boolean
    itemProgress: number
    overallProgress: number
    lastMessage: string
  }
  runtimeCanViewResults: boolean
  runtimeCurrentDetail: string
  runtimeCurrentTitle: string
  runtimeError: string | null
  runtimeErrorTitle: string
  runtimeHeadline: string
  runtimePhase: 'idle' | 'preview-ready' | 'running' | 'completed' | 'error'
  runtimeScope: 'preview' | 'sync' | null
  previewStatusMessage: string
  syncTerminalEntries: { timestamp: string; line: string; scope: 'sync' | 'preview' }[]
  transferFeedItems: string[]
}

export function HomeView({
  canStartSync,
  cleanupFeedItems,
  copiedCount,
  deletedCount,
  homeCounts,
  homePanelClassName,
  isPreviewing,
  onPreview,
  onRetry,
  onStartSync,
  onStop,
  onViewResults,
  previewStatusMessage,
  processedCount,
  processedTotal,
  runState,
  runtimeCanViewResults,
  runtimeCurrentDetail,
  runtimeCurrentTitle,
  runtimeError,
  runtimeErrorTitle,
  runtimeHeadline,
  runtimePhase,
  runtimeScope,
  syncTerminalEntries,
  transferFeedItems,
}: HomeViewProps) {
  const [isHomeTerminalOpen, setIsHomeTerminalOpen] = useState(false)
  const [isTransferFeedOpen, setIsTransferFeedOpen] = useState(false)
  const [isCleanupFeedOpen, setIsCleanupFeedOpen] = useState(false)
  const homeTerminalOpen = isHomeTerminalOpen || runtimePhase === 'running'
  const transferFeedOpen = isTransferFeedOpen && transferFeedItems.length > 0
  const cleanupFeedOpen = isCleanupFeedOpen && cleanupFeedItems.length > 0
  return (
    <section className="view-grid view-grid--home">
      <section className={homePanelClassName}>
        <div className="progress-module-header">
          <div className="progress-module-copy">
            <span className="section-kicker">Current run</span>
            <h2>{runtimeCurrentTitle}</h2>
            <p className="transfer-path">{runtimeCurrentDetail}</p>
            <p className="runtime-headline">{runtimeHeadline}</p>
          </div>
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
        </div>

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
              {processedTotal > 0 ? `${processedCount} / ${processedTotal} files` : 'Awaiting planner totals'}
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
            onClick={() => void onPreview()}
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
            onClick={() => void onStartSync()}
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
                onClick={() => void onRetry()}
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
            <button className="utility-button" onClick={onViewResults} type="button">
              View results
            </button>
          ) : null}
        </div>
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
        count={Math.max(copiedCount, transferFeedItems.length)}
        emptyDetail="Run preview or update to populate this list."
        emptyTitle="No files copied yet"
        eyebrow="Transfer Feed"
        isOpen={transferFeedOpen}
        items={transferFeedItems}
        onToggle={() => setIsTransferFeedOpen((previous) => !previous)}
        title="New files"
      />

      <CollapsibleLogPanel
        count={Math.max(deletedCount, cleanupFeedItems.length)}
        emptyDetail="Cleanup activity will appear here during update runs."
        emptyTitle="No files removed yet"
        eyebrow="Cleanup Feed"
        isOpen={cleanupFeedOpen}
        items={cleanupFeedItems}
        onToggle={() => setIsCleanupFeedOpen((previous) => !previous)}
        title="Removed files"
      />
    </section>
  )
}
