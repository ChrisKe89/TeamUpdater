import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HomeView } from './HomeView'
import { PreviewView } from './PreviewView'
import { HistoryView } from './HistoryView'
import { FolderSelectionView } from './FolderSelectionView'
import { FirmwareRetentionView } from './FirmwareRetentionView'
import { buildDefaultSettings, getFolderDefinitions } from '../lib/settings'
import type { SyncPlan } from '../types'

const previewPlan: SyncPlan = {
  actions: [
    {
      action: 'copy',
      destinationPath: 'C:\\CUSPAPPS\\file.txt',
      folder: 'CUSPAPPS',
      reason: 'file does not exist locally',
      sizeBytes: 32,
      sourcePath: 'S:\\CUSPAPPS\\file.txt',
    },
  ],
  destinationRoot: 'C:\\',
  firmwareRetentionEnabled: true,
  generatedAt: '1711839300000',
  selectedDrive: 'S',
  sourceRoot: 'S:\\',
  summary: {
    copyCount: 1,
    deleteCount: 0,
    skippedDeleteCount: 0,
    totalCopyBytes: 32,
    totalCopyBytesLabel: '32 bytes copied',
  },
}

describe('extracted views', () => {
  it('renders the home view in an idle state', () => {
    render(
      <HomeView
        canStartSync
        cleanupFeedItems={[]}
        copiedCount={0}
        deletedCount={0}
        homeCounts={[
          { label: 'Selected folders', value: '2' },
          { label: 'Planned copies', value: '1' },
          { label: 'Planned deletes', value: '0' },
        ]}
        homePanelClassName="panel highlight-panel runtime-panel"
        isCleanupFeedOpen={false}
        isHomeTerminalOpen={false}
        isPreviewing={false}
        isTransferFeedOpen={false}
        onPreview={async () => undefined}
        onRetry={async () => undefined}
        onStartSync={async () => undefined}
        onStop={async () => undefined}
        onToggleCleanupFeed={() => undefined}
        onToggleHomeTerminal={() => undefined}
        onToggleTransferFeed={() => undefined}
        onViewLogs={() => undefined}
        onViewResults={() => undefined}
        previewStatusMessage="Ready to generate a preview."
        processedCount={0}
        processedTotal={0}
        runState={{
          isRunning: false,
          itemProgress: 0,
          overallProgress: 0,
          lastMessage: 'Ready to sync.',
        }}
        runtimeCanViewResults={false}
        runtimeCurrentDetail="Run preview or update to start a transfer."
        runtimeCurrentTitle="No active transfer"
        runtimeError={null}
        runtimeErrorTitle="Update failed"
        runtimeHeadline="Choose a run mode to start syncing."
        runtimePhase="idle"
        runtimeScope={null}
        syncTerminalEntries={[]}
        transferFeedItems={[]}
      />,
    )

    expect(screen.getByRole('heading', { name: 'No active transfer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run update' })).toBeInTheDocument()
  })

  it('renders the home view in a running state with stop controls', () => {
    const onStop = vi.fn(async () => undefined)

    render(
      <HomeView
        canStartSync
        cleanupFeedItems={['Removed C:\\old.txt']}
        copiedCount={1}
        deletedCount={1}
        homeCounts={[
          { label: 'Selected folders', value: '2' },
          { label: 'Planned copies', value: '4' },
          { label: 'Planned deletes', value: '2' },
        ]}
        homePanelClassName="panel highlight-panel runtime-panel runtime-panel--running"
        isCleanupFeedOpen
        isHomeTerminalOpen
        isPreviewing={false}
        isTransferFeedOpen
        onPreview={async () => undefined}
        onRetry={async () => undefined}
        onStartSync={async () => undefined}
        onStop={onStop}
        onToggleCleanupFeed={() => undefined}
        onToggleHomeTerminal={() => undefined}
        onToggleTransferFeed={() => undefined}
        onViewLogs={() => undefined}
        onViewResults={() => undefined}
        previewStatusMessage="Preview ready."
        processedCount={2}
        processedTotal={6}
        runState={{
          isRunning: true,
          itemProgress: 35,
          overallProgress: 50,
          lastMessage: 'Copying C:\\CUSPAPPS\\file.txt',
        }}
        runtimeCanViewResults={false}
        runtimeCurrentDetail="S:\\CUSPAPPS\\file.txt"
        runtimeCurrentTitle="file.txt"
        runtimeError={null}
        runtimeErrorTitle="Update failed"
        runtimeHeadline="Processing queued files."
        runtimePhase="running"
        runtimeScope="sync"
        syncTerminalEntries={[{ line: 'Copying file.txt', scope: 'sync', timestamp: '1' }]}
        transferFeedItems={['C:\\CUSPAPPS\\file.txt']}
      />,
    )

    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getByText('35% complete')).toBeInTheDocument()
    expect(screen.getByText('Execution terminal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onStop).toHaveBeenCalledTimes(2)
  })

  it('renders the home view with completion and error actions', () => {
    const onRetry = vi.fn(async () => undefined)
    const onViewLogs = vi.fn()
    const onViewResults = vi.fn()
    const { rerender } = render(
      <HomeView
        canStartSync
        cleanupFeedItems={[]}
        copiedCount={3}
        deletedCount={1}
        homeCounts={[
          { label: 'Selected folders', value: '2' },
          { label: 'Planned copies', value: '3' },
          { label: 'Planned deletes', value: '1' },
        ]}
        homePanelClassName="panel highlight-panel runtime-panel runtime-panel--completed"
        isCleanupFeedOpen={false}
        isHomeTerminalOpen={false}
        isPreviewing={false}
        isTransferFeedOpen={false}
        onPreview={async () => undefined}
        onRetry={onRetry}
        onStartSync={async () => undefined}
        onStop={async () => undefined}
        onToggleCleanupFeed={() => undefined}
        onToggleHomeTerminal={() => undefined}
        onToggleTransferFeed={() => undefined}
        onViewLogs={onViewLogs}
        onViewResults={onViewResults}
        previewStatusMessage="Preview scan completed."
        processedCount={4}
        processedTotal={4}
        runState={{
          isRunning: false,
          itemProgress: 100,
          overallProgress: 100,
          lastMessage: 'Sync complete.',
        }}
        runtimeCanViewResults
        runtimeCurrentDetail="C:\\"
        runtimeCurrentTitle="Sync complete"
        runtimeError={null}
        runtimeErrorTitle="Update failed"
        runtimeHeadline="Update completed."
        runtimePhase="completed"
        runtimeScope="sync"
        syncTerminalEntries={[]}
        transferFeedItems={[]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Run preview again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run update again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View results' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View results' }))
    expect(onViewResults).toHaveBeenCalled()

    rerender(
      <HomeView
        canStartSync
        cleanupFeedItems={[]}
        copiedCount={0}
        deletedCount={0}
        homeCounts={[
          { label: 'Selected folders', value: '2' },
          { label: 'Planned copies', value: '0' },
          { label: 'Planned deletes', value: '0' },
        ]}
        homePanelClassName="panel highlight-panel runtime-panel runtime-panel--error"
        isCleanupFeedOpen={false}
        isHomeTerminalOpen={false}
        isPreviewing={false}
        isTransferFeedOpen={false}
        onPreview={async () => undefined}
        onRetry={onRetry}
        onStartSync={async () => undefined}
        onStop={async () => undefined}
        onToggleCleanupFeed={() => undefined}
        onToggleHomeTerminal={() => undefined}
        onToggleTransferFeed={() => undefined}
        onViewLogs={onViewLogs}
        onViewResults={onViewResults}
        previewStatusMessage="Preview scan completed."
        processedCount={0}
        processedTotal={0}
        runState={{
          isRunning: false,
          itemProgress: 0,
          overallProgress: 0,
          lastMessage: 'Sync failed.',
        }}
        runtimeCanViewResults={false}
        runtimeCurrentDetail="Copy failed"
        runtimeCurrentTitle="Update interrupted"
        runtimeError="Disk write failed."
        runtimeErrorTitle="Update failed"
        runtimeHeadline="Update stopped with an error."
        runtimePhase="error"
        runtimeScope="sync"
        syncTerminalEntries={[]}
        transferFeedItems={[]}
      />,
    )

    expect(screen.getByText('Disk write failed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View logs' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'View logs' }))

    expect(onRetry).toHaveBeenCalled()
    expect(onViewLogs).toHaveBeenCalled()
  })

  it('renders the preview view with planned actions', () => {
    render(
      <PreviewView
        canStartSync
        isPreviewCopiesOpen
        isPreviewDeletesOpen={false}
        isPreviewing={false}
        isPreviewSkippedOpen={false}
        isPreviewSummaryOpen
        isPreviewTerminalOpen={false}
        onPreview={async () => undefined}
        onRetry={async () => undefined}
        onStartSync={async () => undefined}
        onStopPreview={async () => undefined}
        onTogglePreviewCopies={() => undefined}
        onTogglePreviewDeletes={() => undefined}
        onTogglePreviewSkipped={() => undefined}
        onTogglePreviewSummary={() => undefined}
        onTogglePreviewTerminal={() => undefined}
        onViewLogs={() => undefined}
        previewActions={{
          copies: previewPlan.actions,
          deletes: [],
          skippedDeletes: [],
        }}
        previewCopyDetail="32 bytes copied to copy"
        previewPlan={previewPlan}
        previewStatusMessage="Preview scan completed."
        previewTerminalEntries={[]}
        runtimeBadgeTone="online"
        runtimePhase="preview-ready"
        runtimeScope="preview"
        runtimeStatusLabel="Preview ready"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Planned file actions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Files to copy' })).toBeInTheDocument()
    expect(screen.getByText('file.txt')).toBeInTheDocument()
  })

  it('renders the preview view empty, running, and error states', () => {
    const { rerender } = render(
      <PreviewView
        canStartSync
        isPreviewCopiesOpen
        isPreviewDeletesOpen={false}
        isPreviewing={false}
        isPreviewSkippedOpen={false}
        isPreviewSummaryOpen
        isPreviewTerminalOpen={false}
        onPreview={async () => undefined}
        onRetry={async () => undefined}
        onStartSync={async () => undefined}
        onStopPreview={async () => undefined}
        onTogglePreviewCopies={() => undefined}
        onTogglePreviewDeletes={() => undefined}
        onTogglePreviewSkipped={() => undefined}
        onTogglePreviewSummary={() => undefined}
        onTogglePreviewTerminal={() => undefined}
        onViewLogs={() => undefined}
        previewActions={{
          copies: [],
          deletes: [],
          skippedDeletes: [],
        }}
        previewCopyDetail={undefined}
        previewPlan={null}
        previewStatusMessage="Ready to generate a preview."
        previewTerminalEntries={[]}
        runtimeBadgeTone="offline"
        runtimePhase="idle"
        runtimeScope={null}
        runtimeStatusLabel="Idle"
      />,
    )

    expect(screen.getByText('No preview available')).toBeInTheDocument()

    rerender(
      <PreviewView
        canStartSync
        isPreviewCopiesOpen
        isPreviewDeletesOpen
        isPreviewing
        isPreviewSkippedOpen
        isPreviewSummaryOpen
        isPreviewTerminalOpen
        onPreview={async () => undefined}
        onRetry={async () => undefined}
        onStartSync={async () => undefined}
        onStopPreview={async () => undefined}
        onTogglePreviewCopies={() => undefined}
        onTogglePreviewDeletes={() => undefined}
        onTogglePreviewSkipped={() => undefined}
        onTogglePreviewSummary={() => undefined}
        onTogglePreviewTerminal={() => undefined}
        onViewLogs={() => undefined}
        previewActions={{
          copies: [],
          deletes: [],
          skippedDeletes: [],
        }}
        previewCopyDetail={undefined}
        previewPlan={null}
        previewStatusMessage="Scanning folders."
        previewTerminalEntries={[{ line: 'Scanning CUSPAPPS', scope: 'preview', timestamp: '1' }]}
        runtimeBadgeTone="online"
        runtimePhase="running"
        runtimeScope="preview"
        runtimeStatusLabel="Running"
      />,
    )

    expect(screen.getByRole('button', { name: 'Refreshing...' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getByText('Preview terminal')).toBeInTheDocument()

    rerender(
      <PreviewView
        canStartSync
        isPreviewCopiesOpen
        isPreviewDeletesOpen={false}
        isPreviewing={false}
        isPreviewSkippedOpen={false}
        isPreviewSummaryOpen
        isPreviewTerminalOpen={false}
        onPreview={async () => undefined}
        onRetry={async () => undefined}
        onStartSync={async () => undefined}
        onStopPreview={async () => undefined}
        onTogglePreviewCopies={() => undefined}
        onTogglePreviewDeletes={() => undefined}
        onTogglePreviewSkipped={() => undefined}
        onTogglePreviewSummary={() => undefined}
        onTogglePreviewTerminal={() => undefined}
        onViewLogs={() => undefined}
        previewActions={{
          copies: [],
          deletes: [],
          skippedDeletes: [],
        }}
        previewCopyDetail={undefined}
        previewPlan={null}
        previewStatusMessage="Preview failed."
        previewTerminalEntries={[]}
        runtimeBadgeTone="offline"
        runtimePhase="error"
        runtimeScope="preview"
        runtimeStatusLabel="Error"
      />,
    )

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View logs' })).toBeInTheDocument()
  })

  it('renders the history view with persisted records', () => {
    render(
      <HistoryView
        historyRecords={[
          {
            destinationRoot: 'C:\\',
            enabledFolders: ['CUSPAPPS'],
            errorMessage: null,
            finishedAt: '1711839300000',
            firmwareRetentionEnabled: false,
            id: '1',
            recentActions: ['Copied C:\\CUSPAPPS\\file.txt'],
            selectedDrive: 'S',
            sourceRoot: 'S:\\',
            startedAt: '1711839200000',
            status: 'completed',
            summary: {
              copiedBytesLabel: '32 bytes copied',
              copiedFiles: 1,
              deletedFiles: 0,
              plannedCopyFiles: 1,
              plannedDeleteFiles: 0,
              plannedSkippedDeletes: 0,
              skippedDeletes: 0,
            },
          },
        ]}
        isHistoryLoading={false}
        onRefreshHistory={async () => undefined}
      />,
    )

    expect(screen.getByText('Persistent local audit trail')).toBeInTheDocument()
    expect(screen.getByText('Copied 1')).toBeInTheDocument()
  })

  it('renders the folder selection view with save actions', () => {
    const onApply = vi.fn(async () => undefined)
    const onReset = vi.fn()
    const onToggleFolder = vi.fn()

    render(
      <FolderSelectionView
        appNotice="Settings saved."
        draftSettings={buildDefaultSettings('S')}
        enabledFolderCount={2}
        folderDefinitions={getFolderDefinitions()}
        hasUnsavedChanges
        isSaving={false}
        onApply={onApply}
        onReset={onReset}
        onToggleFolder={onToggleFolder}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Choose mirrored folders' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'TeamCF' }))

    expect(onApply).toHaveBeenCalled()
    expect(onReset).toHaveBeenCalled()
    expect(onToggleFolder).toHaveBeenCalled()
  })

  it('renders the firmware retention view', () => {
    const onApply = vi.fn(async () => undefined)
    const onReset = vi.fn()
    const onToggleRetention = vi.fn()

    render(
      <FirmwareRetentionView
        firmwareRetentionEnabled
        hasUnsavedChanges
        isSaving={false}
        onApply={onApply}
        onReset={onReset}
        onToggleRetention={onToggleRetention}
      />,
    )

    expect(screen.getByText('Firmware retention enabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Firmware retention enabled/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onToggleRetention).toHaveBeenCalled()
    expect(onApply).toHaveBeenCalled()
    expect(onReset).toHaveBeenCalled()
  })

  it('wires home view actions and collapsible sections', () => {
    const onPreview = vi.fn(async () => undefined)
    const onStartSync = vi.fn(async () => undefined)
    const onToggleHomeTerminal = vi.fn()
    const onToggleTransferFeed = vi.fn()
    const onToggleCleanupFeed = vi.fn()

    render(
      <HomeView
        canStartSync
        cleanupFeedItems={[]}
        copiedCount={0}
        deletedCount={0}
        homeCounts={[
          { label: 'Selected folders', value: '2' },
          { label: 'Planned copies', value: '0' },
          { label: 'Planned deletes', value: '0' },
        ]}
        homePanelClassName="panel highlight-panel runtime-panel"
        isCleanupFeedOpen={false}
        isHomeTerminalOpen={false}
        isPreviewing
        isTransferFeedOpen={false}
        onPreview={onPreview}
        onRetry={async () => undefined}
        onStartSync={onStartSync}
        onStop={async () => undefined}
        onToggleCleanupFeed={onToggleCleanupFeed}
        onToggleHomeTerminal={onToggleHomeTerminal}
        onToggleTransferFeed={onToggleTransferFeed}
        onViewLogs={() => undefined}
        onViewResults={() => undefined}
        previewStatusMessage="Scanning folders."
        processedCount={0}
        processedTotal={0}
        runState={{
          isRunning: false,
          itemProgress: 0,
          overallProgress: 0,
          lastMessage: 'Idle',
        }}
        runtimeCanViewResults={false}
        runtimeCurrentDetail="Waiting"
        runtimeCurrentTitle="No active transfer"
        runtimeError={null}
        runtimeErrorTitle="Update failed"
        runtimeHeadline="Preview is scanning."
        runtimePhase="preview-ready"
        runtimeScope="preview"
        syncTerminalEntries={[]}
        transferFeedItems={[]}
      />,
    )

    expect(screen.getByRole('button', { name: 'Running preview...' })).toBeInTheDocument()
    expect(screen.getByText('Awaiting planner totals')).toBeInTheDocument()
    expect(screen.getByText('Working')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Running preview...' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run update' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Execution terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle New files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Removed files' }))

    expect(onPreview).toHaveBeenCalled()
    expect(onStartSync).toHaveBeenCalled()
    expect(onToggleHomeTerminal).toHaveBeenCalled()
    expect(onToggleTransferFeed).toHaveBeenCalled()
    expect(onToggleCleanupFeed).toHaveBeenCalled()
  })

  it('wires preview view actions, panels, and terminal controls', () => {
    const onPreview = vi.fn(async () => undefined)
    const onStartSync = vi.fn(async () => undefined)
    const onStopPreview = vi.fn(async () => undefined)
    const onRetry = vi.fn(async () => undefined)
    const onViewLogs = vi.fn()
    const onTogglePreviewSummary = vi.fn()
    const onTogglePreviewTerminal = vi.fn()
    const onTogglePreviewCopies = vi.fn()
    const onTogglePreviewDeletes = vi.fn()
    const onTogglePreviewSkipped = vi.fn()

    const { rerender } = render(
      <PreviewView
        canStartSync
        isPreviewCopiesOpen
        isPreviewDeletesOpen
        isPreviewing={false}
        isPreviewSkippedOpen
        isPreviewSummaryOpen
        isPreviewTerminalOpen={false}
        onPreview={onPreview}
        onRetry={onRetry}
        onStartSync={onStartSync}
        onStopPreview={onStopPreview}
        onTogglePreviewCopies={onTogglePreviewCopies}
        onTogglePreviewDeletes={onTogglePreviewDeletes}
        onTogglePreviewSkipped={onTogglePreviewSkipped}
        onTogglePreviewSummary={onTogglePreviewSummary}
        onTogglePreviewTerminal={onTogglePreviewTerminal}
        onViewLogs={onViewLogs}
        previewActions={{
          copies: previewPlan.actions,
          deletes: [],
          skippedDeletes: [],
        }}
        previewCopyDetail="32 bytes copied to copy"
        previewPlan={previewPlan}
        previewStatusMessage="Preview scan completed."
        previewTerminalEntries={[]}
        runtimeBadgeTone="online"
        runtimePhase="preview-ready"
        runtimeScope="preview"
        runtimeStatusLabel="Ready"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run update' }))

    expect(onPreview).toHaveBeenCalled()
    expect(onStartSync).toHaveBeenCalled()

    rerender(
      <PreviewView
        canStartSync
        isPreviewCopiesOpen
        isPreviewDeletesOpen
        isPreviewing
        isPreviewSkippedOpen
        isPreviewSummaryOpen
        isPreviewTerminalOpen
        onPreview={onPreview}
        onRetry={onRetry}
        onStartSync={onStartSync}
        onStopPreview={onStopPreview}
        onTogglePreviewCopies={onTogglePreviewCopies}
        onTogglePreviewDeletes={onTogglePreviewDeletes}
        onTogglePreviewSkipped={onTogglePreviewSkipped}
        onTogglePreviewSummary={onTogglePreviewSummary}
        onTogglePreviewTerminal={onTogglePreviewTerminal}
        onViewLogs={onViewLogs}
        previewActions={{
          copies: previewPlan.actions,
          deletes: [],
          skippedDeletes: [],
        }}
        previewCopyDetail="32 bytes copied to copy"
        previewPlan={previewPlan}
        previewStatusMessage="Scanning folders."
        previewTerminalEntries={[{ line: 'Scanning CUSPAPPS', scope: 'preview', timestamp: '1' }]}
        runtimeBadgeTone="online"
        runtimePhase="running"
        runtimeScope="preview"
        runtimeStatusLabel="Running"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle preview summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Preview terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Files to copy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Files to delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Skipped deletes' }))

    expect(onStopPreview).toHaveBeenCalled()
    expect(onTogglePreviewSummary).toHaveBeenCalled()
    expect(onTogglePreviewTerminal).toHaveBeenCalled()
    expect(onTogglePreviewCopies).toHaveBeenCalled()
    expect(onTogglePreviewDeletes).toHaveBeenCalled()
    expect(onTogglePreviewSkipped).toHaveBeenCalled()

    rerender(
      <PreviewView
        canStartSync
        isPreviewCopiesOpen={false}
        isPreviewDeletesOpen={false}
        isPreviewing={false}
        isPreviewSkippedOpen={false}
        isPreviewSummaryOpen
        isPreviewTerminalOpen={false}
        onPreview={onPreview}
        onRetry={onRetry}
        onStartSync={onStartSync}
        onStopPreview={onStopPreview}
        onTogglePreviewCopies={onTogglePreviewCopies}
        onTogglePreviewDeletes={onTogglePreviewDeletes}
        onTogglePreviewSkipped={onTogglePreviewSkipped}
        onTogglePreviewSummary={onTogglePreviewSummary}
        onTogglePreviewTerminal={onTogglePreviewTerminal}
        onViewLogs={onViewLogs}
        previewActions={{
          copies: [],
          deletes: [],
          skippedDeletes: [],
        }}
        previewCopyDetail={undefined}
        previewPlan={null}
        previewStatusMessage="Preview failed."
        previewTerminalEntries={[]}
        runtimeBadgeTone="offline"
        runtimePhase="error"
        runtimeScope="preview"
        runtimeStatusLabel="Error"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'View logs' }))

    expect(onRetry).toHaveBeenCalled()
    expect(onViewLogs).toHaveBeenCalled()
  })

  it('renders history loading and empty states and refresh action', () => {
    const onRefreshHistory = vi.fn(async () => undefined)
    const { rerender } = render(
      <HistoryView
        historyRecords={[]}
        isHistoryLoading
        onRefreshHistory={onRefreshHistory}
      />,
    )

    expect(screen.getByText('Loading run history...')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }))
    expect(onRefreshHistory).toHaveBeenCalled()

    rerender(
      <HistoryView
        historyRecords={[]}
        isHistoryLoading={false}
        onRefreshHistory={onRefreshHistory}
      />,
    )

    expect(
      screen.getByText('No completed, stopped, or failed runs have been recorded yet.'),
    ).toBeInTheDocument()
  })
})
