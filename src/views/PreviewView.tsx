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
