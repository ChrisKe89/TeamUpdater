import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncRuntime } from './useSyncRuntime'
import type { RunAuditRecord, SyncEvent } from '../types'

const desktopMocks = vi.hoisted(() => ({
  detectShareFileDrives: vi.fn(),
  getFolderDefinitions: vi.fn(),
  loadRunHistory: vi.fn(),
  loadSettings: vi.fn(),
  quitApp: vi.fn(),
  requestStop: vi.fn(),
  saveSettings: vi.fn(),
  startPreview: vi.fn(),
  startSync: vi.fn(),
  writeClientLog: vi.fn(),
}))

const eventMocks = vi.hoisted(() => ({
  listen: vi.fn(),
  emitSyncEvent: (() => undefined) as (event: SyncEvent) => void,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: eventMocks.listen,
}))

vi.mock('../lib/desktop', () => ({
  detectShareFileDrives: desktopMocks.detectShareFileDrives,
  getFolderDefinitions: desktopMocks.getFolderDefinitions,
  isDesktopRuntime: true,
  loadRunHistory: desktopMocks.loadRunHistory,
  loadSettings: desktopMocks.loadSettings,
  quitApp: desktopMocks.quitApp,
  requestStop: desktopMocks.requestStop,
  saveSettings: desktopMocks.saveSettings,
  startPreview: desktopMocks.startPreview,
  startSync: desktopMocks.startSync,
  writeClientLog: desktopMocks.writeClientLog,
}))

const completedRun: RunAuditRecord = {
  destinationRoot: 'C:\\',
  enabledFolders: ['CUSPAPPS'],
  errorMessage: null,
  finishedAt: '1711839300000',
  firmwareRetentionEnabled: false,
  id: 'run-1',
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
}

describe('useSyncRuntime', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { getFolderDefinitions: getStaticDefs } = await import('../lib/settings')
    desktopMocks.getFolderDefinitions.mockResolvedValue(getStaticDefs())
    eventMocks.listen.mockImplementation(
      async (...args: [string, (event: { payload: SyncEvent }) => void]) => {
        const callback = args[1]
        eventMocks.emitSyncEvent = (event: SyncEvent) => callback({ payload: event })
        return () => undefined
      },
    )
    desktopMocks.detectShareFileDrives.mockResolvedValue({
      autoSelected: 'S',
      candidates: [
        {
          cuspDataPath: 'S:\\Folders',
          isReachable: true,
          letter: 'S',
          rootPath: 'S:\\',
        },
      ],
    })
    desktopMocks.loadRunHistory.mockResolvedValue([])
    desktopMocks.loadSettings.mockResolvedValue({
      firmwareRetentionEnabled: false,
      folders: {
        CUSPAPPS: true,
        TeamOSB: true,
      },
      selectedDrive: null,
    })
    desktopMocks.writeClientLog.mockResolvedValue(undefined)
  })

  it('hydrates runtime state and exposes navigation and draft setting updates', async () => {
    const { result } = renderHook(() => useSyncRuntime())

    await waitFor(() => expect(result.current.isInitializing).toBe(false))

    expect(result.current.driveStatus.label).toContain('Connected to S')
    expect(result.current.enabledFolderCount).toBeGreaterThanOrEqual(2)

    act(() => {
      result.current.setActiveView('preview')
      result.current.setSelectedDrive('T')
    })

    expect(result.current.activeView).toBe('preview')
    expect(result.current.draftSettings.selectedDrive).toBe('T')
    expect(result.current.hasUnsavedChanges).toBe(true)
  })

  it('persists settings, resets drafts, and reports command failures', async () => {
    desktopMocks.saveSettings.mockResolvedValue(undefined)
    desktopMocks.requestStop.mockRejectedValue(new Error('stop failed'))
    desktopMocks.quitApp.mockResolvedValue(undefined)

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result } = renderHook(() => useSyncRuntime())

    await waitFor(() => expect(result.current.isInitializing).toBe(false))

    act(() => {
      result.current.setSelectedDrive('T')
    })

    await act(async () => {
      await result.current.handleApplySettings()
    })

    expect(desktopMocks.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ selectedDrive: 'T' }),
    )
    expect(result.current.appNotice).toBe('Settings saved.')
    expect(result.current.hasUnsavedChanges).toBe(false)

    act(() => {
      result.current.setSelectedDrive('S')
      result.current.handleResetSettings()
    })

    expect(result.current.draftSettings.selectedDrive).toBe('T')

    act(() => {
      eventMocks.emitSyncEvent({
        kind: 'preview_started',
        message: 'Preview running.',
      })
    })

    await act(async () => {
      await result.current.handleStopPreview()
    })

    expect(result.current.appError).toBe('stop failed')

    act(() => {
      eventMocks.emitSyncEvent({
        kind: 'run_started',
        message: 'Sync running.',
      })
    })

    await act(async () => {
      await result.current.handleStopSync()
    })

    expect(result.current.appError).toBe('stop failed')

    await act(async () => {
      await result.current.handleQuit()
    })

    expect(confirmSpy).toHaveBeenCalled()
    expect(desktopMocks.quitApp).not.toHaveBeenCalled()
    confirmSpy.mockRestore()
  })

  it('handles preview and sync runtime events and retries the active scope', async () => {
    desktopMocks.startPreview.mockResolvedValue(undefined)
    desktopMocks.startSync.mockResolvedValue(undefined)
    desktopMocks.saveSettings.mockResolvedValue(undefined)
    desktopMocks.loadRunHistory
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([completedRun])
      .mockResolvedValue([completedRun])

    const { result } = renderHook(() => useSyncRuntime())

    await waitFor(() => expect(result.current.isInitializing).toBe(false))
    expect(eventMocks.listen).toHaveBeenCalled()

    await act(async () => {
      await result.current.handlePreview()
    })

    expect(desktopMocks.startPreview).toHaveBeenCalled()
    expect(result.current.runtimePhase).toBe('running')
    expect(result.current.runtimeScope).toBe('preview')
    expect(result.current.activeView).toBe('preview')

    act(() => {
      eventMocks.emitSyncEvent({
        kind: 'log_line',
        line: 'Scanning S:\\CUSPAPPS\\file.txt',
        scope: 'preview',
      })
      eventMocks.emitSyncEvent({
        kind: 'preview_completed',
        message: 'Preview scan completed.',
        plan: {
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
          firmwareRetentionEnabled: false,
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
        },
      })
    })

    expect(result.current.runtimePhase).toBe('preview-ready')
    expect(result.current.previewPlan?.summary.copyCount).toBe(1)
    expect(result.current.previewTerminalEntries).toHaveLength(1)

    act(() => {
      eventMocks.emitSyncEvent({
        kind: 'preview_failed',
        message: 'Preview crashed.',
      })
    })

    expect(result.current.runtimePhase).toBe('error')
    expect(result.current.runtimeScope).toBe('preview')
    expect(result.current.runtimeError).toBe('Preview crashed.')

    await act(async () => {
      await result.current.handleRetryRuntimeAction()
    })

    expect(desktopMocks.startPreview).toHaveBeenCalledTimes(2)

    act(() => {
      eventMocks.emitSyncEvent({
        kind: 'preview_stopped',
        message: 'Preview stopped.',
      })
    })

    await act(async () => {
      await result.current.handleStartSync()
    })

    expect(desktopMocks.saveSettings).not.toHaveBeenCalled()
    expect(desktopMocks.startSync).toHaveBeenCalled()
    expect(result.current.activeView).toBe('home')

    act(() => {
      eventMocks.emitSyncEvent({
        kind: 'item_progress',
        displayName: 'file.txt',
        itemProgress: 50,
        message: 'Copying file.txt',
        overallProgress: 50,
        sourcePath: 'S:\\CUSPAPPS\\file.txt',
      })
      eventMocks.emitSyncEvent({
        kind: 'run_completed',
        message: 'Sync complete.',
        summary: completedRun.summary,
      })
    })

    await waitFor(() => expect(result.current.historyRecords).toHaveLength(1))

    expect(result.current.runtimePhase).toBe('completed')
    expect(result.current.runState.summary?.copiedFiles).toBe(1)
    expect(result.current.runtimeCanViewResults).toBe(true)

    act(() => {
      result.current.handleViewResults()
    })

    expect(result.current.activeView).toBe('history')

    act(() => {
      eventMocks.emitSyncEvent({
        kind: 'run_failed',
        message: 'Sync failed hard.',
      })
    })

    expect(result.current.runtimePhase).toBe('error')
    expect(result.current.runtimeScope).toBe('sync')
    expect(result.current.runtimeError).toBe('Sync failed hard.')

    await act(async () => {
      await result.current.handleRetryRuntimeAction()
    })

    expect(desktopMocks.startSync).toHaveBeenCalledTimes(2)
  })

  it('covers helper actions, refresh failures, and window error logging', async () => {
    desktopMocks.detectShareFileDrives
      .mockResolvedValueOnce({
        autoSelected: 'S',
        candidates: [
          {
            cuspDataPath: 'S:\\Folders',
            isReachable: true,
            letter: 'S',
            rootPath: 'S:\\',
          },
        ],
      })
      .mockRejectedValueOnce('drive refresh failed')
      .mockResolvedValueOnce({
        autoSelected: 'T',
        candidates: [
          {
            cuspDataPath: 'T:\\Folders',
            isReachable: true,
            letter: 'T',
            rootPath: 'T:\\',
          },
        ],
      })
    desktopMocks.loadRunHistory
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce('history refresh failed')
      .mockResolvedValueOnce([completedRun])
    desktopMocks.startPreview.mockRejectedValueOnce('preview start failed')
    desktopMocks.quitApp.mockResolvedValue(undefined)

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { result } = renderHook(() => useSyncRuntime())

    await waitFor(() => expect(result.current.isInitializing).toBe(false))

    act(() => {
      const optionalFolder = result.current.folderDefinitions.find((folder) => !folder.isMandatory)
      const mandatoryFolder = result.current.folderDefinitions.find((folder) => folder.isMandatory)

      if (!optionalFolder || !mandatoryFolder) {
        throw new Error('Expected both optional and mandatory folders.')
      }

      result.current.handleFolderToggle(optionalFolder)
      result.current.handleFolderToggle(mandatoryFolder)
      result.current.handleFirmwareRetentionToggle()
    })

    expect(result.current.enabledFolderCount).toBe(3)
    expect(result.current.draftSettings.firmwareRetentionEnabled).toBe(true)

    await act(async () => {
      await result.current.refreshHistory()
    })

    expect(result.current.appError).toBe('history refresh failed')

    await act(async () => {
      await result.current.refreshDriveDetection()
    })

    expect(result.current.appError).toBe('drive refresh failed')

    await act(async () => {
      await result.current.refreshDriveDetection()
    })

    expect(result.current.draftSettings.selectedDrive).toBe('S')

    act(() => {
      result.current.handleViewResults()
    })

    expect(result.current.activeView).toBe('history')

    await act(async () => {
      await result.current.handleQuit()
    })

    expect(confirmSpy).not.toHaveBeenCalled()
    expect(desktopMocks.quitApp).toHaveBeenCalled()

    act(() => {
      window.dispatchEvent(new ErrorEvent('error', { message: 'Window exploded' }))
      window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason: 'bad promise' }))
    })

    await waitFor(() =>
      expect(desktopMocks.writeClientLog).toHaveBeenCalledWith(
        'ERROR',
        expect.stringContaining('Window error: Window exploded'),
      ),
    )
    expect(desktopMocks.writeClientLog).toHaveBeenCalledWith(
      'ERROR',
      expect.stringContaining('Unhandled promise rejection: bad promise'),
    )

    confirmSpy.mockRestore()
  })
})
