import { useState } from 'react'
import {
  CollapseButton,
  EmptyState,
  PlanPanel,
  StatCard,
  TerminalPanel,
} from '../components/app-panels'
import { formatTimestamp } from '../lib/runtime'
import type { SyncPlan, TerminalEntry } from '../types'

export interface PreviewViewProps {
  canStartSync: boolean
  isPreviewing: boolean
  onPreview: () => Promise<void>
  onRetry: () => Promise<void>
  onStartSync: () => Promise<void>
  onStopPreview: () => Promise<void>
  previewActions: {
    copies: SyncPlan['actions']
    deletes: SyncPlan['actions']
    skippedDeletes: SyncPlan['actions']
  }
  previewCopyDetail: string | undefined
  previewPlan: SyncPlan | null
  previewStatusMessage: string
  previewTerminalEntries: TerminalEntry[]
  runtimeBadgeTone: string
  runtimePhase: 'idle' | 'preview-ready' | 'running' | 'completed' | 'error'
  runtimeScope: 'preview' | 'sync' | null
  runtimeStatusLabel: string
}

export function PreviewView({
  canStartSync,
  isPreviewing,
  onPreview,
  onRetry,
  onStartSync,
  onStopPreview,
  previewActions,
  previewCopyDetail,
  previewPlan,
  previewStatusMessage,
  previewTerminalEntries,
  runtimeBadgeTone,
  runtimePhase,
  runtimeScope,
  runtimeStatusLabel,
}: PreviewViewProps) {
  const [isPreviewSummaryOpen, setIsPreviewSummaryOpen] = useState(true)   // starts open
  const [isPreviewTerminalOpen, setIsPreviewTerminalOpen] = useState(false)
  const [isPreviewCopiesOpen, setIsPreviewCopiesOpen] = useState(true)     // starts open
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
              onClick={() => void onPreview()}
              type="button"
            >
              {isPreviewing ? 'Refreshing...' : 'Refresh preview'}
            </button>
            <button
              className="primary-button"
              disabled={!canStartSync || runtimePhase === 'running'}
              onClick={() => void onStartSync()}
              type="button"
            >
              Run update
            </button>
            {runtimePhase === 'running' && runtimeScope === 'preview' ? (
              <button
                className="utility-button utility-button--danger utility-button--strong"
                onClick={() => void onStopPreview()}
                type="button"
              >
                Stop
              </button>
            ) : null}
            {runtimePhase === 'error' && runtimeScope === 'preview' ? (
              <>
                <button
                  className="utility-button utility-button--danger utility-button--strong"
                  onClick={() => void onRetry()}
                  type="button"
                >
                  Retry
                </button>
                <button className="utility-button" onClick={() => setIsPreviewTerminalOpen(true)} type="button">
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
        onCancel={isPreviewing ? () => void onStopPreview() : undefined}
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
