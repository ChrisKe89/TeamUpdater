// src/hooks/useRuntime.ts
import { useCallback, useEffect, useMemo, useRef, useReducer } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  detectShareFileDrives,
  getFolderDefinitions,
  isDesktopRuntime,
  loadRunHistory,
  loadSettings,
  quitApp,
  requestStop,
  startPreview,
  startSync,
  writeClientLog,
} from '../lib/desktop'
import {
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
} from '../lib/runtime'
import { initialRuntimeState, runtimeReducer } from '../lib/runtime-reducer'
import { getErrorMessage } from '../lib/errors'
import { mergeSettings } from '../lib/settings'
import type {
  AppSettings,
  DetectDrivesResponse,
  DriveCandidate,
  FolderDefinition,
  NavView,
  SyncEvent,
} from '../types'

export interface UseRuntimeOptions {
  draftSettings: AppSettings
  autoSelectedDrive: string | null
  selectedCandidate: DriveCandidate | null
  folderDefinitions: FolderDefinition[]
  onError: (message: string | null) => void
  onNotice: (message: string | null) => void
  hydrateSettings: (loadedSettings: AppSettings, autoSelectedDrive: string | null, folderDefinitions: FolderDefinition[]) => void
  initializeDrives: (detected: DetectDrivesResponse) => void
  onFolderDefinitionsLoaded: (defs: FolderDefinition[]) => void
}

export function useRuntime({
  draftSettings,
  autoSelectedDrive,
  selectedCandidate: _selectedCandidate,
  folderDefinitions,
  onError,
  onNotice,
  hydrateSettings,
  initializeDrives,
  onFolderDefinitionsLoaded,
}: UseRuntimeOptions) {
  const [state, dispatch] = useReducer(runtimeReducer, initialRuntimeState)

  const onErrorRef = useRef(onError)
  useEffect(() => { onErrorRef.current = onError }, [onError])

  const onNoticeRef = useRef(onNotice)
  useEffect(() => { onNoticeRef.current = onNotice }, [onNotice])

  const refreshHistory = useCallback(async () => {
    if (!isDesktopRuntime) return
    dispatch({ type: 'HISTORY_LOADING' })
    onErrorRef.current(null)
    try {
      const records = await loadRunHistory()
      dispatch({ type: 'HISTORY_LOADED', records })
    } catch (error) {
      onErrorRef.current(getErrorMessage(error, 'Unable to load run history.'))
      dispatch({ type: 'HISTORY_FAILED' })
    }
  }, [])

  const refreshHistoryRef = useRef(refreshHistory)
  useEffect(() => { refreshHistoryRef.current = refreshHistory }, [refreshHistory])

  const onFolderDefinitionsLoadedRef = useRef(onFolderDefinitionsLoaded)
  useEffect(() => { onFolderDefinitionsLoadedRef.current = onFolderDefinitionsLoaded }, [onFolderDefinitionsLoaded])

  const hydrateSettingsRef = useRef(hydrateSettings)
  useEffect(() => { hydrateSettingsRef.current = hydrateSettings }, [hydrateSettings])

  const initializeDrivesRef = useRef(initializeDrives)
  useEffect(() => { initializeDrivesRef.current = initializeDrives }, [initializeDrives])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        const [loadedSettings, detectedDrives, records, loadedFolderDefs] = await Promise.all([
          loadSettings(),
          detectShareFileDrives(),
          loadRunHistory(),
          getFolderDefinitions(),
        ])
        if (cancelled) return
        onFolderDefinitionsLoadedRef.current(loadedFolderDefs)
        hydrateSettingsRef.current(loadedSettings, detectedDrives.autoSelected, loadedFolderDefs)
        initializeDrivesRef.current(detectedDrives)
        dispatch({ type: 'INIT_COMPLETE', records })
      } catch (error) {
        if (!cancelled) {
          onErrorRef.current(getErrorMessage(error, 'Unable to initialise the app.'))
          dispatch({ type: 'INIT_FAILED' })
        }
      }
    }

    const unlistenPromise = isDesktopRuntime
      ? listen<SyncEvent>('sync://event', (event) => {
          if (cancelled) return
          dispatch({ type: 'SYNC_EVENT', payload: event.payload })
          const payload = event.payload
          if (payload.kind === 'preview_failed') onErrorRef.current(payload.message)
          if (payload.kind === 'run_failed') onErrorRef.current(payload.message)
          if (
            payload.kind === 'run_completed' ||
            payload.kind === 'run_stopped' ||
            payload.kind === 'run_failed'
          ) {
            void refreshHistoryRef.current()
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
      `Runtime state changed: phase=${state.phase}, scope=${state.scope ?? 'none'}`,
    )
  }, [state.phase, state.scope])

  // Derived values
  const syncTerminalEntries = useMemo(
    () => getScopedTerminalEntries(state.terminalEntries, 'sync'),
    [state.terminalEntries],
  )
  const previewTerminalEntries = useMemo(
    () => getScopedTerminalEntries(state.terminalEntries, 'preview'),
    [state.terminalEntries],
  )
  const transferFeedItems = useMemo(
    () => getTransferFeedItems(state.runState.transferLog, syncTerminalEntries),
    [state.runState.transferLog, syncTerminalEntries],
  )
  const cleanupFeedItems = useMemo(
    () => getCleanupFeedItems(state.runState.deletionLog, syncTerminalEntries),
    [state.runState.deletionLog, syncTerminalEntries],
  )
  const previewActions = useMemo(() => getPreviewActions(state.previewPlan), [state.previewPlan])
  const previewCopyDetail = state.previewPlan
    ? `${state.previewPlan.summary.totalCopyBytesLabel} to copy`
    : undefined
  const plannedCopyCount =
    state.previewPlan?.summary.copyCount ?? state.runState.summary?.plannedCopyFiles ?? 0
  const plannedDeleteCount =
    state.previewPlan?.summary.deleteCount ?? state.runState.summary?.plannedDeleteFiles ?? 0
  const processedCount = state.runState.copiedCount + state.runState.deletedCount
  const processedTotal = plannedCopyCount + plannedDeleteCount
  const runtimeStatusLabel = getRuntimeStatusLabel(state.phase, state.scope)
  const runtimeBadgeTone = getRuntimeBadgeTone(state.phase)
  const homeTransferTitle =
    state.runState.currentItem?.displayName ??
    (state.runState.isRunning ? 'Preparing transfer' : 'No active transfer')
  const homeTransferDetail =
    state.runState.currentItem?.sourcePath ??
    (state.runState.isRunning ? state.runState.lastMessage : 'Run preview or update to start a transfer.')
  const runtimeHeadline = getRuntimeHeadline({
    isPreviewing: state.isPreviewing,
    phase: state.phase,
    previewCount: state.previewPlan?.actions.length ?? 0,
    processedCount,
    processedTotal,
    runMessage: state.runState.lastMessage,
    runtimeError: state.error,
  })
  const runtimeCurrentTitle = getRuntimeCurrentTitle({
    homeTransferTitle,
    isPreviewing: state.isPreviewing,
    phase: state.phase,
    previewStatusMessage: state.previewStatusMessage,
    runtimeError: state.error,
  })
  const runtimeCurrentDetail = getRuntimeCurrentDetail({
    homeTransferDetail,
    isPreviewing: state.isPreviewing,
    phase: state.phase,
    previewStatusMessage: state.previewStatusMessage,
    runtimeError: state.error,
  })
  const runtimeCanViewResults = Boolean(state.previewPlan || state.runState.summary)
  const runtimeErrorTitle = state.scope === 'preview' ? 'Preview failed' : 'Update failed'
  const homePanelClassName = getHomePanelClassName(state.phase)
  const enabledFolderCount = useMemo(
    () => Object.values(draftSettings.folders).filter(Boolean).length,
    [draftSettings.folders],
  )
  const homeCounts = useMemo(
    () => getHomeCounts(enabledFolderCount, state.previewPlan, state.runState.summary),
    [enabledFolderCount, state.previewPlan, state.runState.summary],
  )

  // Actions
  const handlePreview = useCallback(async () => {
    if (state.runState.isRunning || state.isPreviewing) return
    onErrorRef.current(null)
    onNoticeRef.current(null)
    dispatch({ type: 'PREVIEW_INITIATED' })
    try {
      await startPreview(mergeSettings(folderDefinitions, draftSettings, autoSelectedDrive))
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to build the sync preview.')
      onErrorRef.current(message)
      dispatch({ type: 'SYNC_EVENT', payload: { kind: 'preview_failed', message } })
    }
  }, [state.runState.isRunning, state.isPreviewing, draftSettings, autoSelectedDrive, folderDefinitions])

  const handleStopPreview = useCallback(async () => {
    try {
      await requestStop()
    } catch (error) {
      onErrorRef.current(getErrorMessage(error, 'Unable to request preview stop.'))
    }
  }, [])

  const handleStartSync = useCallback(async () => {
    if (state.runState.isRunning || state.isPreviewing) return
    onErrorRef.current(null)
    onNoticeRef.current(null)
    dispatch({ type: 'SYNC_INITIATED' })
    try {
      await startSync(mergeSettings(folderDefinitions, draftSettings, autoSelectedDrive))
    } catch (error) {
      const message = getErrorMessage(error, 'Unable to start sync.')
      onErrorRef.current(message)
      dispatch({ type: 'SYNC_EVENT', payload: { kind: 'run_failed', message } })
    }
  }, [state.runState.isRunning, state.isPreviewing, draftSettings, autoSelectedDrive, folderDefinitions])

  const handleStopSync = useCallback(async () => {
    try {
      await requestStop()
    } catch (error) {
      onErrorRef.current(getErrorMessage(error, 'Unable to request stop.'))
    }
  }, [])

  const handleQuit = useCallback(async () => {
    if (state.runState.isRunning || state.isPreviewing) {
      const shouldQuit = window.confirm('A preview or sync is currently running. Quit the app anyway?')
      if (!shouldQuit) return
    }
    try {
      await quitApp()
    } catch (error) {
      onErrorRef.current(getErrorMessage(error, 'Unable to quit.'))
    }
  }, [state.runState.isRunning, state.isPreviewing])

  const handleRetryRuntimeAction = useCallback(async () => {
    if (state.scope === 'preview') {
      await handlePreview()
      return
    }
    await handleStartSync()
  }, [state.scope, handlePreview, handleStartSync])

  const navigateToHistory = useCallback(() => {
    dispatch({ type: 'SET_ACTIVE_VIEW', view: 'history' })
    void refreshHistory()
  }, [refreshHistory])

  const handleViewResults = useCallback(() => {
    if (state.previewPlan) {
      dispatch({ type: 'SET_ACTIVE_VIEW', view: 'preview' })
      return
    }
    navigateToHistory()
  }, [state.previewPlan, navigateToHistory])

  const setActiveView = useCallback((view: NavView) => {
    dispatch({ type: 'SET_ACTIVE_VIEW', view })
  }, [])

  return {
    activeView: state.activeView,
    setActiveView,
    runState: state.runState,
    previewPlan: state.previewPlan,
    historyRecords: state.historyRecords,
    isInitializing: state.isInitializing,
    isHistoryLoading: state.isHistoryLoading,
    isPreviewing: state.isPreviewing,
    previewStatusMessage: state.previewStatusMessage,
    runtimePhase: state.phase,
    runtimeScope: state.scope,
    runtimeError: state.error,
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
