// src/hooks/useRuntime.ts
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  detectShareFileDrives,
  isDesktopRuntime,
  loadRunHistory,
  loadSettings,
  quitApp,
  requestPreviewStop,
  requestSyncStop,
  startPreview,
  startSync,
  writeClientLog,
} from '../lib/desktop'
import {
  appendTerminalEntry,
  getCleanupFeedItems,
  getHomeCounts,
  getHomePanelClassName,
  getPreviewActions,
  getRuntimeBadgeTone,
  getRuntimeCurrentDetail,
  getRuntimeCurrentTitle,
  getRuntimeHeadline,
  getRuntimeStatusLabel,
  getScopedTerminalEntries,
  getTransferFeedItems,
  initialRunState,
  reduceSyncEvent,
  type RuntimePhase,
  type RuntimeScope,
} from '../lib/runtime'
import { mergeSettings } from '../lib/settings'
import type {
  AppSettings,
  DetectDrivesResponse,
  DriveCandidate,
  NavView,
  RunAuditRecord,
  SyncEvent,
  SyncPlan,
  SyncRunState,
  TerminalEntry,
} from '../types'

export interface UseRuntimeOptions {
  draftSettings: AppSettings
  autoSelectedDrive: string | null
  selectedCandidate: DriveCandidate | null
  onError: (message: string | null) => void
  onNotice: (message: string | null) => void
  hydrateSettings: (loadedSettings: AppSettings, autoSelectedDrive: string | null) => void
  initializeDrives: (detected: DetectDrivesResponse) => void
}

export function useRuntime({
  draftSettings,
  autoSelectedDrive,
  selectedCandidate: _selectedCandidate,
  onError,
  onNotice,
  hydrateSettings,
  initializeDrives,
}: UseRuntimeOptions) {
  const [activeView, setActiveView] = useState<NavView>('home')
  const [runState, setRunState] = useState<SyncRunState>(initialRunState)
  const [previewPlan, setPreviewPlan] = useState<SyncPlan | null>(null)
  const [historyRecords, setHistoryRecords] = useState<RunAuditRecord[]>([])
  const [isInitializing, setIsInitializing] = useState(true)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [previewStatusMessage, setPreviewStatusMessage] = useState('Ready to generate a preview.')
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([])
  const [runtimePhase, setRuntimePhase] = useState<RuntimePhase>('idle')
  const [runtimeScope, setRuntimeScope] = useState<RuntimeScope>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  const refreshHistory = useCallback(async () => {
    if (!isDesktopRuntime) return
    setIsHistoryLoading(true)
    onError(null)
    try {
      const records = await loadRunHistory()
      setHistoryRecords(records)
    } catch (error) {
      onError(getErrorMessage(error, 'Unable to load run history.'))
    } finally {
      setIsHistoryLoading(false)
    }
  }, [onError])

  const refreshHistoryRef = useRef(refreshHistory)
  useEffect(() => {
    refreshHistoryRef.current = refreshHistory
  }, [refreshHistory])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const [loadedSettings, detectedDrives, loadedHistory] = await Promise.all([
          loadSettings(),
          detectShareFileDrives(),
          loadRunHistory(),
        ])
        if (cancelled) return
        hydrateSettings(loadedSettings, detectedDrives.autoSelected)
        initializeDrives(detectedDrives)
        setHistoryRecords(loadedHistory)
      } catch (error) {
        if (!cancelled) {
          onError(getErrorMessage(error, 'Unable to initialise the app.'))
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
          if (cancelled) return
          const payload = event.payload

          switch (payload.kind) {
            case 'preview_started':
              setIsPreviewing(true)
              setRuntimePhase('running')
              setRuntimeScope('preview')
              setRuntimeError(null)
              setPreviewStatusMessage(payload.message)
              setTerminalEntries([])
              return
            case 'preview_completed':
              setIsPreviewing(false)
              setRuntimePhase('preview-ready')
              setRuntimeScope('preview')
              setRuntimeError(null)
              setPreviewPlan(payload.plan)
              setActiveView('preview')
              setPreviewStatusMessage(payload.message)
              return
            case 'preview_stopped':
              setIsPreviewing(false)
              setRuntimePhase('idle')
              setRuntimeScope('preview')
              setPreviewStatusMessage(payload.message)
              return
            case 'preview_failed':
              setIsPreviewing(false)
              setRuntimePhase('error')
              setRuntimeScope('preview')
              setRuntimeError(payload.message)
              setPreviewStatusMessage(payload.message)
              onError(payload.message)
              return
            case 'log_line':
              setTerminalEntries((previous) => appendTerminalEntry(previous, payload))
              return
            default:
              setRunState((previous) => reduceSyncEvent(previous, payload))
              if (payload.kind === 'run_started') {
                setRuntimePhase('running')
                setRuntimeScope('sync')
                setRuntimeError(null)
                setTerminalEntries([])
              }
              if (payload.kind === 'run_completed' || payload.kind === 'run_stopped') {
                setRuntimePhase('completed')
                setRuntimeScope('sync')
                setRuntimeError(null)
              }
              if (payload.kind === 'run_failed') {
                setRuntimePhase('error')
                setRuntimeScope('sync')
                setRuntimeError(payload.message)
                onError(payload.message)
              }
              if (
                payload.kind === 'run_completed' ||
                payload.kind === 'run_stopped' ||
                payload.kind === 'run_failed'
              ) {
                void refreshHistoryRef.current()
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
    void writeClientLog(
      'INFO',
      `Runtime state changed: phase=${runtimePhase}, scope=${runtimeScope ?? 'none'}`,
    )
  }, [runtimePhase, runtimeScope])

  // Derived values
  const syncTerminalEntries = useMemo(
    () => getScopedTerminalEntries(terminalEntries, 'sync'),
    [terminalEntries],
  )
  const previewTerminalEntries = useMemo(
    () => getScopedTerminalEntries(terminalEntries, 'preview'),
    [terminalEntries],
  )
  const transferFeedItems = useMemo(
    () => getTransferFeedItems(runState.transferLog, syncTerminalEntries),
    [runState.transferLog, syncTerminalEntries],
  )
  const cleanupFeedItems = useMemo(
    () => getCleanupFeedItems(runState.deletionLog, syncTerminalEntries),
    [runState.deletionLog, syncTerminalEntries],
  )
  const previewActions = useMemo(() => getPreviewActions(previewPlan), [previewPlan])
  const previewCopyDetail = previewPlan ? `${previewPlan.summary.totalCopyBytesLabel} to copy` : undefined
  const plannedCopyCount = previewPlan?.summary.copyCount ?? runState.summary?.plannedCopyFiles ?? 0
  const plannedDeleteCount = previewPlan?.summary.deleteCount ?? runState.summary?.plannedDeleteFiles ?? 0
  const processedCount = runState.copiedCount + runState.deletedCount
  const processedTotal = plannedCopyCount + plannedDeleteCount
  const runtimeStatusLabel = getRuntimeStatusLabel(runtimePhase, runtimeScope)
  const runtimeBadgeTone = getRuntimeBadgeTone(runtimePhase)
  const homeTransferTitle =
    runState.currentItem?.displayName ??
    (runState.isRunning ? 'Preparing transfer' : 'No active transfer')
  const homeTransferDetail =
    runState.currentItem?.sourcePath ??
    (runState.isRunning ? runState.lastMessage : 'Run preview or update to start a transfer.')
  const runtimeHeadline = getRuntimeHeadline({
    isPreviewing,
    phase: runtimePhase,
    previewCount: previewPlan?.actions.length ?? 0,
    processedCount,
    processedTotal,
    runMessage: runState.lastMessage,
    runtimeError,
  })
  const runtimeCurrentTitle = getRuntimeCurrentTitle({
    homeTransferTitle,
    isPreviewing,
    phase: runtimePhase,
    previewStatusMessage,
    runtimeError,
  })
  const runtimeCurrentDetail = getRuntimeCurrentDetail({
    homeTransferDetail,
    isPreviewing,
    phase: runtimePhase,
    previewStatusMessage,
    runtimeError,
  })
  const runtimeCanViewResults = Boolean(previewPlan || runState.summary)
  const runtimeErrorTitle = runtimeScope === 'preview' ? 'Preview failed' : 'Update failed'
  const homePanelClassName = getHomePanelClassName(runtimePhase)
  const enabledFolderCount = useMemo(
    () => Object.values(draftSettings.folders).filter(Boolean).length,
    [draftSettings.folders],
  )
  const homeCounts = useMemo(
    () => getHomeCounts(enabledFolderCount, previewPlan, runState.summary),
    [enabledFolderCount, previewPlan, runState.summary],
  )

  // Actions
  const handlePreview = useCallback(async () => {
    if (runState.isRunning || isPreviewing) return
    setIsPreviewing(true)
    setRuntimePhase('running')
    setRuntimeScope('preview')
    setRuntimeError(null)
    onError(null)
    onNotice(null)
    setPreviewStatusMessage('Preview queued.')
    setTerminalEntries([])
    try {
      const nextSettings = mergeSettings(draftSettings, autoSelectedDrive)
      setActiveView('preview')
      setPreviewPlan(null)
      await startPreview(nextSettings)
    } catch (error) {
      setIsPreviewing(false)
      const message = getErrorMessage(error, 'Unable to build the sync preview.')
      setRuntimePhase('error')
      setRuntimeScope('preview')
      setRuntimeError(message)
      setPreviewStatusMessage(message)
      onError(message)
    }
  }, [runState.isRunning, isPreviewing, draftSettings, autoSelectedDrive, onError, onNotice])

  const handleStopPreview = useCallback(async () => {
    try {
      await requestPreviewStop()
    } catch (error) {
      onError(getErrorMessage(error, 'Unable to request preview stop.'))
    }
  }, [onError])

  const handleStartSync = useCallback(async () => {
    if (runState.isRunning || isPreviewing) return
    setRuntimePhase('running')
    setRuntimeScope('sync')
    setRuntimeError(null)
    onError(null)
    onNotice(null)
    setTerminalEntries([])
    setPreviewStatusMessage('Ready to generate a preview.')
    setActiveView('home')
    setRunState({
      ...initialRunState,
      isRunning: true,
      lastMessage: 'Sync queued.',
    })
    try {
      await startSync(mergeSettings(draftSettings, autoSelectedDrive))
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to start sync.')
      setRuntimePhase('error')
      setRuntimeScope('sync')
      setRuntimeError(message)
      setRunState((previous) => ({
        ...previous,
        isRunning: false,
        lastMessage: message,
      }))
      onError(message)
    }
  }, [runState.isRunning, isPreviewing, draftSettings, autoSelectedDrive, onError, onNotice])

  const handleStopSync = useCallback(async () => {
    try {
      await requestSyncStop()
    } catch (error) {
      onError(getErrorMessage(error, 'Unable to request stop.'))
    }
  }, [onError])

  const handleQuit = useCallback(async () => {
    if (runState.isRunning || isPreviewing) {
      const shouldQuit = window.confirm('A preview or sync is currently running. Quit the app anyway?')
      if (!shouldQuit) return
    }
    try {
      await quitApp()
    } catch (error) {
      onError(getErrorMessage(error, 'Unable to quit.'))
    }
  }, [runState.isRunning, isPreviewing, onError])

  const handleRetryRuntimeAction = useCallback(async () => {
    if (runtimeScope === 'preview') {
      await handlePreview()
      return
    }
    await handleStartSync()
  }, [runtimeScope, handlePreview, handleStartSync])

  const navigateToHistory = useCallback(() => {
    setActiveView('history')
    void refreshHistory()
  }, [refreshHistory])

  const handleViewResults = useCallback(() => {
    if (previewPlan) {
      setActiveView('preview')
      return
    }
    navigateToHistory()
  }, [previewPlan, navigateToHistory])

  return {
    activeView,
    setActiveView,
    runState,
    previewPlan,
    historyRecords,
    isInitializing,
    isHistoryLoading,
    isPreviewing,
    previewStatusMessage,
    runtimePhase,
    runtimeScope,
    runtimeError,
    runtimeErrorTitle,
    runtimeCanViewResults,
    syncTerminalEntries,
    previewTerminalEntries,
    transferFeedItems,
    cleanupFeedItems,
    previewActions,
    previewCopyDetail,
    processedCount,
    processedTotal,
    runtimeStatusLabel,
    runtimeBadgeTone,
    runtimeHeadline,
    runtimeCurrentTitle,
    runtimeCurrentDetail,
    homePanelClassName,
    homeCounts,
    enabledFolderCount,
    refreshHistory,
    handlePreview,
    handleStopPreview,
    handleStartSync,
    handleStopSync,
    handleQuit,
    handleRetryRuntimeAction,
    navigateToHistory,
    handleViewResults,
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
