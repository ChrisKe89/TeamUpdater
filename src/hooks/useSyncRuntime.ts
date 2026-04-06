import { useEffect, useMemo, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  detectShareFileDrives,
  isDesktopRuntime,
  loadRunHistory,
  loadSettings,
  quitApp,
  requestPreviewStop,
  requestSyncStop,
  saveSettings,
  startPreview,
  startSync,
  writeClientLog,
} from '../lib/desktop'
import {
  appendTerminalEntry,
  getCleanupFeedItems,
  getDriveStatus,
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
import {
  areSettingsEqual,
  buildDefaultSettings,
  getFolderDefinitions,
  mergeSettings,
} from '../lib/settings'
import type {
  AppSettings,
  DetectDrivesResponse,
  FolderDefinition,
  NavView,
  RunAuditRecord,
  SyncEvent,
  SyncPlan,
  SyncRunState,
  TerminalEntry,
} from '../types'

const folderDefinitions = getFolderDefinitions()
const driveLetters = Array.from({ length: 26 }, (_, index) => String.fromCharCode(65 + index))

export interface SyncRuntimeState {
  activeView: NavView
  appError: string | null
  appNotice: string | null
  canStartSync: boolean
  cleanupFeedItems: string[]
  draftSettings: AppSettings
  driveStatus: { tone: 'online' | 'offline'; label: string }
  enabledFolderCount: number
  folderDefinitions: FolderDefinition[]
  hasUnsavedChanges: boolean
  historyRecords: RunAuditRecord[]
  homeCounts: { label: string; value: string }[]
  homePanelClassName: string
  isHistoryLoading: boolean
  isInitializing: boolean
  isPreviewing: boolean
  isSaving: boolean
  previewActions: {
    copies: SyncPlan['actions']
    deletes: SyncPlan['actions']
    skippedDeletes: SyncPlan['actions']
  }
  previewCopyDetail: string | undefined
  previewPlan: SyncPlan | null
  previewStatusMessage: string
  previewTerminalEntries: TerminalEntry[]
  processedCount: number
  processedTotal: number
  runState: SyncRunState
  runtimeBadgeTone: string
  runtimeCanViewResults: boolean
  runtimeCurrentDetail: string
  runtimeCurrentTitle: string
  runtimeError: string | null
  runtimeErrorTitle: string
  runtimeHeadline: string
  runtimePhase: RuntimePhase
  runtimeScope: RuntimeScope
  runtimeStatusLabel: string
  selectableDrives: { letter: string; isReachable: boolean }[]
  settings: AppSettings
  syncTerminalEntries: TerminalEntry[]
  topLevelAppError: string | null
  transferFeedItems: string[]
}

export interface SyncRuntimeActions {
  handleApplySettings: () => Promise<void>
  handleFolderToggle: (folder: FolderDefinition) => void
  handleFirmwareRetentionToggle: () => void
  handlePreview: () => Promise<void>
  handleQuit: () => Promise<void>
  handleResetSettings: () => void
  handleRetryRuntimeAction: () => Promise<void>
  handleStartSync: () => Promise<void>
  handleStopPreview: () => Promise<void>
  handleStopSync: () => Promise<void>
  handleViewResults: () => void
  navigateToHistory: () => void
  refreshDriveDetection: () => Promise<void>
  refreshHistory: () => Promise<void>
  setActiveView: (view: NavView) => void
  setSelectedDrive: (drive: string | null) => void
}

export function useSyncRuntime(): SyncRuntimeState & SyncRuntimeActions {
  const [activeView, setActiveView] = useState<NavView>('home')
  const [driveInfo, setDriveInfo] = useState<DetectDrivesResponse>({
    candidates: [],
    autoSelected: null,
  })
  const [settings, setSettings] = useState<AppSettings>(buildDefaultSettings())
  const [draftSettings, setDraftSettings] = useState<AppSettings>(buildDefaultSettings())
  const [runState, setRunState] = useState<SyncRunState>(initialRunState)
  const [previewPlan, setPreviewPlan] = useState<SyncPlan | null>(null)
  const [historyRecords, setHistoryRecords] = useState<RunAuditRecord[]>([])
  const [appError, setAppError] = useState<string | null>(null)
  const [appNotice, setAppNotice] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [previewStatusMessage, setPreviewStatusMessage] = useState('Ready to generate a preview.')
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([])
  const [runtimePhase, setRuntimePhase] = useState<RuntimePhase>('idle')
  const [runtimeScope, setRuntimeScope] = useState<RuntimeScope>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  const refreshHistory = async () => {
    if (!isDesktopRuntime) {
      return
    }

    setIsHistoryLoading(true)
    setAppError(null)

    try {
      const records = await loadRunHistory()
      setHistoryRecords(records)
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to load run history.'))
    } finally {
      setIsHistoryLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const refreshHistoryFromRuntime = async () => {
      if (!isDesktopRuntime || cancelled) {
        return
      }

      try {
        const records = await loadRunHistory()
        if (!cancelled) {
          setHistoryRecords(records)
        }
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error, 'Unable to load run history.'))
        }
      } finally {
        if (!cancelled) {
          setIsHistoryLoading(false)
        }
      }
    }

    const init = async () => {
      try {
        const [loadedSettings, detectedDrives, loadedHistory] = await Promise.all([
          loadSettings(),
          detectShareFileDrives(),
          loadRunHistory(),
        ])

        if (cancelled) {
          return
        }

        const mergedSettings = mergeSettings(loadedSettings, detectedDrives.autoSelected)
        setDriveInfo(detectedDrives)
        setSettings(mergedSettings)
        setDraftSettings(mergedSettings)
        setHistoryRecords(loadedHistory)
      } catch (error) {
        if (!cancelled) {
          setAppError(getErrorMessage(error, 'Unable to initialise the app.'))
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
              setAppError(payload.message)
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
                setAppError(payload.message)
              }

              if (
                payload.kind === 'run_completed' ||
                payload.kind === 'run_stopped' ||
                payload.kind === 'run_failed'
              ) {
                void refreshHistoryFromRuntime()
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
    if (!appNotice) {
      return
    }

    const timeoutId = window.setTimeout(() => setAppNotice(null), 2400)
    return () => window.clearTimeout(timeoutId)
  }, [appNotice])

  useEffect(() => {
    void writeClientLog('INFO', 'App mounted.')

    const handleWindowError = (event: ErrorEvent) => {
      const detail = event.error instanceof Error ? event.error.stack ?? event.error.message : event.message
      void writeClientLog(
        'ERROR',
        `Window error: ${event.message || 'Unknown error'}${detail ? ` | ${detail}` : ''}`,
      )
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason =
        event.reason instanceof Error
          ? event.reason.stack ?? event.reason.message
          : String(event.reason)
      void writeClientLog('ERROR', `Unhandled promise rejection: ${reason}`)
    }

    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  useEffect(() => {
    if (!appError) {
      return
    }

    void writeClientLog('ERROR', `App error: ${appError}`)
  }, [appError])

  useEffect(() => {
    void writeClientLog(
      'INFO',
      `Runtime state changed: phase=${runtimePhase}, scope=${runtimeScope ?? 'none'}`,
    )
  }, [runtimePhase, runtimeScope])

  const selectableDrives = useMemo(() => {
    const detectedLetters = new Set(driveInfo.candidates.map((candidate) => candidate.letter))

    return driveLetters.map((letter) => ({
      letter,
      isReachable: detectedLetters.has(letter),
    }))
  }, [driveInfo.candidates])

  const selectedDrive = draftSettings.selectedDrive
  const selectedCandidate = useMemo(
    () => driveInfo.candidates.find((candidate) => candidate.letter === selectedDrive) ?? null,
    [driveInfo.candidates, selectedDrive],
  )
  const previewActions = useMemo(() => getPreviewActions(previewPlan), [previewPlan])
  const driveStatus = useMemo(
    () => getDriveStatus(selectedDrive, selectedCandidate),
    [selectedCandidate, selectedDrive],
  )
  const enabledFolderCount = useMemo(
    () => folderDefinitions.filter((folder) => draftSettings.folders[folder.key]).length,
    [draftSettings.folders],
  )
  const canStartSync =
    !isInitializing &&
    !runState.isRunning &&
    !isPreviewing &&
    Boolean(selectedDrive) &&
    driveStatus.tone === 'online'
  const hasUnsavedChanges = useMemo(
    () => !areSettingsEqual(settings, draftSettings),
    [draftSettings, settings],
  )
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
  const homeCounts = useMemo(
    () => getHomeCounts(enabledFolderCount, previewPlan, runState.summary),
    [enabledFolderCount, previewPlan, runState.summary],
  )
  const homeTransferTitle =
    runState.currentItem?.displayName ??
    (runState.isRunning ? 'Preparing transfer' : 'No active transfer')
  const homeTransferDetail =
    runState.currentItem?.sourcePath ??
    (runState.isRunning ? runState.lastMessage : 'Run preview or update to start a transfer.')
  const previewCopyDetail = previewPlan ? `${previewPlan.summary.totalCopyBytesLabel} to copy` : undefined
  const plannedCopyCount = previewPlan?.summary.copyCount ?? runState.summary?.plannedCopyFiles ?? 0
  const plannedDeleteCount =
    previewPlan?.summary.deleteCount ?? runState.summary?.plannedDeleteFiles ?? 0
  const processedCount = runState.copiedCount + runState.deletedCount
  const processedTotal = plannedCopyCount + plannedDeleteCount
  const runtimeStatusLabel = getRuntimeStatusLabel(runtimePhase, runtimeScope)
  const runtimeBadgeTone = getRuntimeBadgeTone(runtimePhase)
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
  const topLevelAppError = runtimePhase === 'error' ? null : appError
  const homePanelClassName = getHomePanelClassName(runtimePhase)

  const persistSettings = async (nextSettings: AppSettings) => {
    setIsSaving(true)
    setAppError(null)
    setAppNotice(null)

    try {
      await saveSettings(nextSettings)
      setSettings(nextSettings)
      setDraftSettings(nextSettings)
      setAppNotice('Settings saved.')
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

  const handlePreview = async () => {
    if (!canStartSync) {
      return
    }

    setIsPreviewing(true)
    setRuntimePhase('running')
    setRuntimeScope('preview')
    setRuntimeError(null)
    setAppError(null)
    setAppNotice(null)
    setPreviewStatusMessage('Preview queued.')
    setTerminalEntries([])

    try {
      const nextSettings = mergeSettings(draftSettings, driveInfo.autoSelected)
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
      setAppError(message)
    }
  }

  const handleStopPreview = async () => {
    try {
      await requestPreviewStop()
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to request preview stop.'))
    }
  }

  const handleStartSync = async () => {
    if (!canStartSync) {
      return
    }

    setRuntimePhase('running')
    setRuntimeScope('sync')
    setRuntimeError(null)
    setAppError(null)
    setAppNotice(null)
    setTerminalEntries([])
    setPreviewStatusMessage('Ready to generate a preview.')
    setActiveView('home')
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
      const message = getErrorMessage(error, 'Unable to start sync.')
      setRuntimePhase('error')
      setRuntimeScope('sync')
      setRuntimeError(message)
      setRunState((previous) => ({
        ...previous,
        isRunning: false,
        lastMessage: message,
      }))
      setAppError(message)
    }
  }

  const handleStopSync = async () => {
    try {
      await requestSyncStop()
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to request stop.'))
    }
  }

  const handleQuit = async () => {
    if (runState.isRunning || isPreviewing) {
      const shouldQuit = window.confirm(
        'A preview or sync is currently running. Quit the app anyway?',
      )

      if (!shouldQuit) {
        return
      }
    }

    await quitApp()
  }

  const handleApplySettings = async () => {
    await persistSettings(mergeSettings(draftSettings, driveInfo.autoSelected))
  }

  const handleResetSettings = () => {
    setDraftSettings(settings)
    setAppError(null)
    setAppNotice(null)
  }

  const handleRetryRuntimeAction = async () => {
    if (runtimeScope === 'preview') {
      await handlePreview()
      return
    }

    await handleStartSync()
  }

  const navigateToHistory = () => {
    setActiveView('history')
    void refreshHistory()
  }

  const handleViewResults = () => {
    if (previewPlan) {
      setActiveView('preview')
      return
    }

    navigateToHistory()
  }

  const setSelectedDrive = (drive: string | null) => {
    setDraftSettings((previous) => ({
      ...previous,
      selectedDrive: drive,
    }))
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

  return {
    activeView,
    appError,
    appNotice,
    canStartSync,
    cleanupFeedItems,
    draftSettings,
    driveStatus,
    enabledFolderCount,
    folderDefinitions,
    handleApplySettings,
    handleFolderToggle,
    handleFirmwareRetentionToggle,
    handlePreview,
    handleQuit,
    handleResetSettings,
    handleRetryRuntimeAction,
    handleStartSync,
    handleStopPreview,
    handleStopSync,
    handleViewResults,
    hasUnsavedChanges,
    historyRecords,
    homeCounts,
    homePanelClassName,
    isHistoryLoading,
    isInitializing,
    isPreviewing,
    isSaving,
    navigateToHistory,
    previewActions,
    previewCopyDetail,
    previewPlan,
    previewStatusMessage,
    previewTerminalEntries,
    processedCount,
    processedTotal,
    refreshDriveDetection,
    refreshHistory,
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
    setActiveView,
    setSelectedDrive,
    settings,
    syncTerminalEntries,
    topLevelAppError,
    transferFeedItems,
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
