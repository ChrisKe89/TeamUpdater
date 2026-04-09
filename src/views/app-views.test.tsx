import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HomeView } from './HomeView'
import { PreviewView } from './PreviewView'
import { HistoryView } from './HistoryView'
import { FolderSelectionView } from './FolderSelectionView'
import { FirmwareRetentionView } from './FirmwareRetentionView'
import { buildDefaultSettings, getFolderDefinitions } from '../lib/settings'
import { initialRunState } from '../lib/runtime'
import { SyncRuntimeContext, type SyncRuntimeContextValue } from '../context/SyncRuntimeContext'
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

const folderDefs = getFolderDefinitions()
const defaultSettings = buildDefaultSettings(folderDefs, 'S')

function makeCtx(overrides: Partial<SyncRuntimeContextValue> = {}): SyncRuntimeContextValue {
  return {
    activeView: 'home',
    appError: null,
    appNotice: null,
    canStartSync: true,
    cleanupFeedItems: [],
    draftSettings: defaultSettings,
    driveStatus: { tone: 'online', label: 'Connected to S:\\' },
    enabledFolderCount: 2,
    folderDefinitions: folderDefs,
    hasUnsavedChanges: false,
    historyRecords: [],
    homeCounts: [
      { label: 'Selected folders', value: '2' },
      { label: 'Planned copies', value: '0' },
      { label: 'Planned deletes', value: '0' },
    ],
    homePanelClassName: 'panel highlight-panel runtime-panel',
    isHistoryLoading: false,
    isInitializing: false,
    isPreviewing: false,
    isSaving: false,
    previewActions: { copies: [], deletes: [], skippedDeletes: [] },
    previewCopyDetail: undefined,
    previewPlan: null,
    previewStatusMessage: 'Ready to generate a preview.',
    previewTerminalEntries: [],
    processedCount: 0,
    processedTotal: 0,
    runState: { ...initialRunState },
    runtimeBadgeTone: 'neutral',
    runtimeCanViewResults: false,
    runtimeCurrentDetail: 'Run preview or update to start a transfer.',
    runtimeCurrentTitle: 'No active transfer',
    runtimeError: null,
    runtimeErrorTitle: 'Update failed',
    runtimeHeadline: 'Choose a run mode to start syncing.',
    runtimePhase: 'idle',
    runtimeScope: null,
    runtimeStatusLabel: 'Idle',
    selectableDrives: [{ letter: 'S', isReachable: true }],
    settings: defaultSettings,
    syncTerminalEntries: [],
    topLevelAppError: null,
    transferFeedItems: [],
    handleApplySettings: vi.fn(async () => undefined),
    handleFirmwareRetentionToggle: vi.fn(),
    handleFolderToggle: vi.fn(),
    handlePreview: vi.fn(async () => undefined),
    handleQuit: vi.fn(async () => undefined),
    handleResetSettings: vi.fn(),
    handleRetryRuntimeAction: vi.fn(async () => undefined),
    handleStartSync: vi.fn(async () => undefined),
    handleStopPreview: vi.fn(async () => undefined),
    handleStopSync: vi.fn(async () => undefined),
    handleViewResults: vi.fn(),
    navigateToHistory: vi.fn(),
    refreshDriveDetection: vi.fn(async () => undefined),
    refreshHistory: vi.fn(async () => undefined),
    setActiveView: vi.fn(),
    setSelectedDrive: vi.fn(),
    ...overrides,
  }
}

function renderWithCtx(ui: React.ReactElement, ctx: SyncRuntimeContextValue) {
  return render(
    <SyncRuntimeContext.Provider value={ctx}>{ui}</SyncRuntimeContext.Provider>,
  )
}

describe('extracted views', () => {
  it('renders the home view in an idle state', () => {
    renderWithCtx(<HomeView />, makeCtx({
      runtimeCurrentTitle: 'No active transfer',
      runtimePhase: 'idle',
    }))

    expect(screen.getByRole('heading', { name: 'No active transfer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run preview' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run update' })).toBeInTheDocument()
  })

  it('renders the home view in a running state with stop controls', () => {
    const handleStopSync = vi.fn(async () => undefined)
    const handleStopPreview = vi.fn(async () => undefined)

    renderWithCtx(<HomeView />, makeCtx({
      cleanupFeedItems: ['Removed C:\\old.txt'],
      homeCounts: [
        { label: 'Selected folders', value: '2' },
        { label: 'Planned copies', value: '4' },
        { label: 'Planned deletes', value: '2' },
      ],
      homePanelClassName: 'panel highlight-panel runtime-panel runtime-panel--running',
      isPreviewing: false,
      previewStatusMessage: 'Preview ready.',
      processedCount: 2,
      processedTotal: 6,
      runState: {
        ...initialRunState,
        isRunning: true,
        itemProgress: 35,
        overallProgress: 50,
        copiedCount: 1,
        deletedCount: 1,
        lastMessage: 'Copying C:\\CUSPAPPS\\file.txt',
      },
      runtimeCurrentDetail: 'S:\\CUSPAPPS\\file.txt',
      runtimeCurrentTitle: 'file.txt',
      runtimePhase: 'running',
      runtimeScope: 'sync',
      syncTerminalEntries: [{ line: 'Copying file.txt', scope: 'sync', timestamp: '1' }],
      transferFeedItems: ['C:\\CUSPAPPS\\file.txt'],
      handleStopSync,
      handleStopPreview,
    }))

    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getByText('35% complete')).toBeInTheDocument()
    expect(screen.getByText('Execution terminal')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(handleStopSync).toHaveBeenCalledTimes(2)
  })

  it('renders the home view with completion and error actions', () => {
    const handleRetryRuntimeAction = vi.fn(async () => undefined)
    const handleViewResults = vi.fn()

    const completedCtx = makeCtx({
      homeCounts: [
        { label: 'Selected folders', value: '2' },
        { label: 'Planned copies', value: '3' },
        { label: 'Planned deletes', value: '1' },
      ],
      homePanelClassName: 'panel highlight-panel runtime-panel runtime-panel--completed',
      processedCount: 4,
      processedTotal: 4,
      runState: {
        ...initialRunState,
        isRunning: false,
        itemProgress: 100,
        overallProgress: 100,
        copiedCount: 3,
        deletedCount: 1,
        lastMessage: 'Sync complete.',
      },
      runtimeCanViewResults: true,
      runtimeCurrentDetail: 'C:\\',
      runtimeCurrentTitle: 'Sync complete',
      runtimeHeadline: 'Update completed.',
      runtimePhase: 'completed',
      runtimeScope: 'sync',
      handleRetryRuntimeAction,
      handleViewResults,
    })

    const { rerender } = renderWithCtx(<HomeView />, completedCtx)

    expect(screen.getByRole('button', { name: 'Run preview again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run update again' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View results' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View results' }))
    expect(handleViewResults).toHaveBeenCalled()

    const errorCtx = makeCtx({
      homePanelClassName: 'panel highlight-panel runtime-panel runtime-panel--error',
      runState: {
        ...initialRunState,
        isRunning: false,
        lastMessage: 'Sync failed.',
      },
      runtimeCanViewResults: false,
      runtimeCurrentDetail: 'Copy failed',
      runtimeCurrentTitle: 'Update interrupted',
      runtimeError: 'Disk write failed.',
      runtimeErrorTitle: 'Update failed',
      runtimeHeadline: 'Update stopped with an error.',
      runtimePhase: 'error',
      runtimeScope: 'sync',
      handleRetryRuntimeAction,
      handleViewResults,
    })

    rerender(
      <SyncRuntimeContext.Provider value={errorCtx}><HomeView /></SyncRuntimeContext.Provider>,
    )

    expect(screen.getByText('Disk write failed.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View logs' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'View logs' }))

    expect(handleRetryRuntimeAction).toHaveBeenCalled()
  })

  it('renders the preview view with planned actions', () => {
    renderWithCtx(<PreviewView />, makeCtx({
      previewActions: {
        copies: previewPlan.actions,
        deletes: [],
        skippedDeletes: [],
      },
      previewCopyDetail: '32 bytes copied to copy',
      previewPlan,
      previewStatusMessage: 'Preview scan completed.',
      runtimeBadgeTone: 'online',
      runtimePhase: 'preview-ready',
      runtimeScope: 'preview',
      runtimeStatusLabel: 'Preview ready',
    }))

    expect(screen.getByRole('heading', { name: 'Planned file actions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Files to copy' })).toBeInTheDocument()
    expect(screen.getByText('file.txt')).toBeInTheDocument()
  })

  it('renders the preview view empty, running, and error states', () => {
    const { rerender } = renderWithCtx(<PreviewView />, makeCtx({
      previewPlan: null,
      previewStatusMessage: 'Ready to generate a preview.',
      runtimeBadgeTone: 'offline',
      runtimePhase: 'idle',
      runtimeScope: null,
      runtimeStatusLabel: 'Idle',
    }))

    expect(screen.getByText('No preview available')).toBeInTheDocument()

    const runningCtx = makeCtx({
      isPreviewing: true,
      previewPlan: null,
      previewStatusMessage: 'Scanning folders.',
      previewTerminalEntries: [{ line: 'Scanning CUSPAPPS', scope: 'preview', timestamp: '1' }],
      runtimeBadgeTone: 'online',
      runtimePhase: 'running',
      runtimeScope: 'preview',
      runtimeStatusLabel: 'Running',
    })

    rerender(
      <SyncRuntimeContext.Provider value={runningCtx}><PreviewView /></SyncRuntimeContext.Provider>,
    )

    expect(screen.getByRole('button', { name: 'Refreshing...' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getByText('Preview terminal')).toBeInTheDocument()

    const errorCtx = makeCtx({
      isPreviewing: false,
      previewPlan: null,
      previewStatusMessage: 'Preview failed.',
      runtimeBadgeTone: 'offline',
      runtimePhase: 'error',
      runtimeScope: 'preview',
      runtimeStatusLabel: 'Error',
    })

    rerender(
      <SyncRuntimeContext.Provider value={errorCtx}><PreviewView /></SyncRuntimeContext.Provider>,
    )

    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View logs' })).toBeInTheDocument()
  })

  it('renders the history view with persisted records', () => {
    renderWithCtx(<HistoryView />, makeCtx({
      historyRecords: [
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
      ],
      isHistoryLoading: false,
    }))

    expect(screen.getByText('Persistent local audit trail')).toBeInTheDocument()
    expect(screen.getByText('Copied 1')).toBeInTheDocument()
  })

  it('renders the folder selection view with save actions', () => {
    const handleApplySettings = vi.fn(async () => undefined)
    const handleResetSettings = vi.fn()
    const handleFolderToggle = vi.fn()

    renderWithCtx(<FolderSelectionView />, makeCtx({
      appNotice: 'Settings saved.',
      draftSettings: buildDefaultSettings(getFolderDefinitions(), 'S'),
      enabledFolderCount: 2,
      folderDefinitions: getFolderDefinitions(),
      hasUnsavedChanges: true,
      isSaving: false,
      handleApplySettings,
      handleResetSettings,
      handleFolderToggle,
    }))

    expect(screen.getByRole('heading', { name: 'Choose mirrored folders' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'TeamCF' }))

    expect(handleApplySettings).toHaveBeenCalled()
    expect(handleResetSettings).toHaveBeenCalled()
    expect(handleFolderToggle).toHaveBeenCalled()
  })

  it('renders the firmware retention view', () => {
    const handleApplySettings = vi.fn(async () => undefined)
    const handleResetSettings = vi.fn()
    const handleFirmwareRetentionToggle = vi.fn()

    renderWithCtx(<FirmwareRetentionView />, makeCtx({
      draftSettings: { ...defaultSettings, firmwareRetentionEnabled: true },
      hasUnsavedChanges: true,
      isSaving: false,
      handleApplySettings,
      handleResetSettings,
      handleFirmwareRetentionToggle,
    }))

    expect(screen.getByText('Firmware retention enabled')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Firmware retention enabled/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(handleFirmwareRetentionToggle).toHaveBeenCalled()
    expect(handleApplySettings).toHaveBeenCalled()
    expect(handleResetSettings).toHaveBeenCalled()
  })

  it('wires home view actions and collapsible sections', () => {
    const handlePreview = vi.fn(async () => undefined)
    const handleStartSync = vi.fn(async () => undefined)

    renderWithCtx(<HomeView />, makeCtx({
      homeCounts: [
        { label: 'Selected folders', value: '2' },
        { label: 'Planned copies', value: '0' },
        { label: 'Planned deletes', value: '0' },
      ],
      homePanelClassName: 'panel highlight-panel runtime-panel',
      isPreviewing: true,
      previewStatusMessage: 'Scanning folders.',
      runtimeCurrentDetail: 'Waiting',
      runtimeCurrentTitle: 'No active transfer',
      runtimeHeadline: 'Preview is scanning.',
      runtimePhase: 'preview-ready',
      runtimeScope: 'preview',
      handlePreview,
      handleStartSync,
    }))

    expect(screen.getByRole('button', { name: 'Running preview...' })).toBeInTheDocument()
    expect(screen.getByText('Awaiting planner totals')).toBeInTheDocument()
    expect(screen.getByText('Working')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Running preview...' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run update' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Execution terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle New files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Removed files' }))

    expect(handlePreview).toHaveBeenCalled()
    expect(handleStartSync).toHaveBeenCalled()
  })

  it('wires preview view actions, panels, and terminal controls', () => {
    const handlePreview = vi.fn(async () => undefined)
    const handleStartSync = vi.fn(async () => undefined)
    const handleStopPreview = vi.fn(async () => undefined)
    const handleRetryRuntimeAction = vi.fn(async () => undefined)

    const readyCtx = makeCtx({
      previewActions: {
        copies: previewPlan.actions,
        deletes: [],
        skippedDeletes: [],
      },
      previewCopyDetail: '32 bytes copied to copy',
      previewPlan,
      previewStatusMessage: 'Preview scan completed.',
      runtimeBadgeTone: 'online',
      runtimePhase: 'preview-ready',
      runtimeScope: 'preview',
      runtimeStatusLabel: 'Ready',
      handlePreview,
      handleStartSync,
      handleStopPreview,
      handleRetryRuntimeAction,
    })

    const { rerender } = renderWithCtx(<PreviewView />, readyCtx)

    fireEvent.click(screen.getByRole('button', { name: 'Refresh preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Run update' }))

    expect(handlePreview).toHaveBeenCalled()
    expect(handleStartSync).toHaveBeenCalled()

    const runningCtx = makeCtx({
      isPreviewing: true,
      previewActions: {
        copies: previewPlan.actions,
        deletes: [],
        skippedDeletes: [],
      },
      previewCopyDetail: '32 bytes copied to copy',
      previewPlan,
      previewStatusMessage: 'Scanning folders.',
      previewTerminalEntries: [{ line: 'Scanning CUSPAPPS', scope: 'preview', timestamp: '1' }],
      runtimeBadgeTone: 'online',
      runtimePhase: 'running',
      runtimeScope: 'preview',
      runtimeStatusLabel: 'Running',
      handlePreview,
      handleStartSync,
      handleStopPreview,
      handleRetryRuntimeAction,
    })

    rerender(
      <SyncRuntimeContext.Provider value={runningCtx}><PreviewView /></SyncRuntimeContext.Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle preview summary' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Preview terminal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Files to copy' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Files to delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Toggle Skipped deletes' }))

    expect(handleStopPreview).toHaveBeenCalled()

    const errorCtx = makeCtx({
      isPreviewing: false,
      previewPlan: null,
      previewStatusMessage: 'Preview failed.',
      runtimeBadgeTone: 'offline',
      runtimePhase: 'error',
      runtimeScope: 'preview',
      runtimeStatusLabel: 'Error',
      handlePreview,
      handleStartSync,
      handleStopPreview,
      handleRetryRuntimeAction,
    })

    rerender(
      <SyncRuntimeContext.Provider value={errorCtx}><PreviewView /></SyncRuntimeContext.Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    fireEvent.click(screen.getByRole('button', { name: 'View logs' }))

    expect(handleRetryRuntimeAction).toHaveBeenCalled()
  })

  it('renders history loading and empty states and refresh action', () => {
    const refreshHistory = vi.fn(async () => undefined)

    const { rerender } = renderWithCtx(<HistoryView />, makeCtx({
      historyRecords: [],
      isHistoryLoading: true,
      refreshHistory,
    }))

    expect(screen.getByText('Loading run history...')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }))
    expect(refreshHistory).toHaveBeenCalled()

    rerender(
      <SyncRuntimeContext.Provider value={makeCtx({
        historyRecords: [],
        isHistoryLoading: false,
        refreshHistory,
      })}><HistoryView /></SyncRuntimeContext.Provider>,
    )

    expect(
      screen.getByText('No completed, stopped, or failed runs have been recorded yet.'),
    ).toBeInTheDocument()
  })
})
