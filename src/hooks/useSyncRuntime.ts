// src/hooks/useSyncRuntime.ts
import { useCallback, useEffect, useState } from 'react'
import { detectShareFileDrives, writeClientLog } from '../lib/desktop'
import { mergeSettings } from '../lib/settings'
import type { AppSettings, FolderDefinition, NavView, RunAuditRecord, SyncPlan, SyncRunState, TerminalEntry } from '../types'
import type { RuntimePhase, RuntimeScope } from '../lib/runtime'
import { useDriveDetection } from './useDriveDetection'
import { useRuntime } from './useRuntime'
import { useSettings } from './useSettings'

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
  const [appError, setAppError] = useState<string | null>(null)
  const [appNotice, setAppNotice] = useState<string | null>(null)
  const [folderDefinitions, setFolderDefinitions] = useState<FolderDefinition[]>([])

  const settings = useSettings({ onError: setAppError, onNotice: setAppNotice, folderDefinitions })
  const drive = useDriveDetection({ selectedDrive: settings.draftSettings.selectedDrive })
  const runtime = useRuntime({
    draftSettings: settings.draftSettings,
    autoSelectedDrive: drive.driveInfo.autoSelected,
    selectedCandidate: drive.selectedCandidate,
    onError: setAppError,
    onNotice: setAppNotice,
    hydrateSettings: settings.hydrate,
    initializeDrives: drive.initialize,
    onFolderDefinitionsLoaded: setFolderDefinitions,
  })

  // Auto-dismiss notices
  useEffect(() => {
    if (!appNotice) return
    const timeoutId = window.setTimeout(() => setAppNotice(null), 2400)
    return () => window.clearTimeout(timeoutId)
  }, [appNotice])

  // Global error logging
  useEffect(() => {
    void writeClientLog('INFO', 'App mounted.')

    const handleWindowError = (event: ErrorEvent) => {
      const detail =
        event.error instanceof Error
          ? event.error.stack ?? event.error.message
          : event.message
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

  // Log app errors
  useEffect(() => {
    if (!appError) return
    void writeClientLog('ERROR', `App error: ${appError}`)
  }, [appError])

  // Cross-cutting derived values
  const canStartSync =
    !runtime.isInitializing &&
    !runtime.runState.isRunning &&
    !runtime.isPreviewing &&
    Boolean(settings.draftSettings.selectedDrive) &&
    drive.driveStatus.tone === 'online'

  const topLevelAppError = runtime.runtimePhase === 'error' ? null : appError

  // Cross-cutting actions
  const persistSettings = settings.persistSettings
  const draftSettingsValue = settings.draftSettings
  const autoSelected = drive.driveInfo.autoSelected

  const handleApplySettings = useCallback(async () => {
    await persistSettings(mergeSettings(folderDefinitions, draftSettingsValue, autoSelected))
  }, [persistSettings, folderDefinitions, draftSettingsValue, autoSelected])

  const selectedDriveValue = settings.draftSettings.selectedDrive
  const driveInitialize = drive.initialize
  const setSelectedDrive = settings.setSelectedDrive

  const refreshDriveDetection = useCallback(async () => {
    setAppError(null)
    try {
      const detected = await detectShareFileDrives()
      const nextDrive = selectedDriveValue || detected.autoSelected || null
      driveInitialize(detected)
      setSelectedDrive(nextDrive)
    } catch (error) {
      setAppError(getErrorMessage(error, 'Unable to detect ShareFile drives.'))
    }
  }, [selectedDriveValue, driveInitialize, setSelectedDrive, setAppError])

  return {
    // Settings
    settings: settings.settings,
    draftSettings: settings.draftSettings,
    isSaving: settings.isSaving,
    hasUnsavedChanges: settings.hasUnsavedChanges,
    folderDefinitions,
    handleApplySettings,
    handleResetSettings: settings.handleResetSettings,
    handleFolderToggle: settings.handleFolderToggle,
    handleFirmwareRetentionToggle: settings.handleFirmwareRetentionToggle,
    setSelectedDrive: settings.setSelectedDrive,
    // Drive
    driveStatus: drive.driveStatus,
    selectableDrives: drive.selectableDrives,
    // Runtime
    activeView: runtime.activeView,
    setActiveView: runtime.setActiveView,
    runState: runtime.runState,
    previewPlan: runtime.previewPlan,
    historyRecords: runtime.historyRecords,
    isInitializing: runtime.isInitializing,
    isHistoryLoading: runtime.isHistoryLoading,
    isPreviewing: runtime.isPreviewing,
    previewStatusMessage: runtime.previewStatusMessage,
    runtimePhase: runtime.runtimePhase,
    runtimeScope: runtime.runtimeScope,
    runtimeError: runtime.runtimeError,
    runtimeErrorTitle: runtime.runtimeErrorTitle,
    runtimeCanViewResults: runtime.runtimeCanViewResults,
    syncTerminalEntries: runtime.syncTerminalEntries,
    previewTerminalEntries: runtime.previewTerminalEntries,
    transferFeedItems: runtime.transferFeedItems,
    cleanupFeedItems: runtime.cleanupFeedItems,
    previewActions: runtime.previewActions,
    previewCopyDetail: runtime.previewCopyDetail,
    processedCount: runtime.processedCount,
    processedTotal: runtime.processedTotal,
    runtimeStatusLabel: runtime.runtimeStatusLabel,
    runtimeBadgeTone: runtime.runtimeBadgeTone,
    runtimeHeadline: runtime.runtimeHeadline,
    runtimeCurrentTitle: runtime.runtimeCurrentTitle,
    runtimeCurrentDetail: runtime.runtimeCurrentDetail,
    homePanelClassName: runtime.homePanelClassName,
    homeCounts: runtime.homeCounts,
    enabledFolderCount: runtime.enabledFolderCount,
    refreshHistory: runtime.refreshHistory,
    handlePreview: runtime.handlePreview,
    handleStopPreview: runtime.handleStopPreview,
    handleStartSync: runtime.handleStartSync,
    handleStopSync: runtime.handleStopSync,
    handleQuit: runtime.handleQuit,
    handleRetryRuntimeAction: runtime.handleRetryRuntimeAction,
    navigateToHistory: runtime.navigateToHistory,
    handleViewResults: runtime.handleViewResults,
    refreshDriveDetection,
    // Shared
    appError,
    appNotice,
    canStartSync,
    topLevelAppError,
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}
