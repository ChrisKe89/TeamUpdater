import type {
  DriveCandidate,
  RunAuditRecord,
  SyncEvent,
  SyncEventScope,
  SyncPlan,
  SyncRunState,
  SyncSummary,
  TerminalEntry,
} from '../types'

export type RuntimePhase = 'idle' | 'preview-ready' | 'running' | 'completed' | 'error'
export type RuntimeScope = SyncEventScope | null

const TERMINAL_LOG_LIMIT = 400

export const initialRunState: SyncRunState = {
  isRunning: false,
  currentItem: null,
  itemProgress: 0,
  overallProgress: 0,
  copiedCount: 0,
  deletedCount: 0,
  transferLog: [],
  deletionLog: [],
  summary: null,
  lastMessage: 'Ready to sync.',
}

export function reduceSyncEvent(previous: SyncRunState, event: SyncEvent): SyncRunState {
  switch (event.kind) {
    case 'run_started':
      return { ...initialRunState, isRunning: true, lastMessage: event.message }
    case 'item_progress':
      return {
        ...previous,
        currentItem: { displayName: event.displayName, sourcePath: event.sourcePath },
        itemProgress: event.itemProgress,
        overallProgress: event.overallProgress,
        lastMessage: event.message,
      }
    case 'file_copied':
      return {
        ...previous,
        copiedCount: event.totalCopied,
        transferLog: [...previous.transferLog, event.destinationPath],
        lastMessage: event.message,
      }
    case 'file_deleted':
      return {
        ...previous,
        deletedCount: event.totalDeleted,
        deletionLog: [...previous.deletionLog, event.destinationPath],
        lastMessage: event.message,
      }
    case 'run_completed':
      return {
        ...previous,
        isRunning: false,
        itemProgress: 100,
        overallProgress: 100,
        summary: event.summary,
        lastMessage: event.message,
      }
    case 'run_stopped':
      return { ...previous, isRunning: false, summary: event.summary, lastMessage: event.message }
    case 'run_failed':
      return { ...previous, isRunning: false, lastMessage: event.message }
    default:
      return previous
  }
}

export function appendTerminalEntry(
  previous: TerminalEntry[],
  event: Extract<SyncEvent, { kind: 'log_line' }>,
) {
  const nextEntry: TerminalEntry = {
    scope: event.scope,
    line: event.line,
    timestamp: new Date().toLocaleTimeString(),
  }

  return [...previous, nextEntry].slice(-TERMINAL_LOG_LIMIT)
}

export function formatTimestamp(value: string) {
  const timestamp = Number(value)

  if (Number.isNaN(timestamp) || timestamp <= 0) {
    return value
  }

  return new Date(timestamp).toLocaleString()
}

export function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, value))
}

export function formatProgress(value: number) {
  return Math.round(clampProgress(value))
}

export function getPathLeaf(value: string) {
  const normalized = value.replace(/\\/g, '/')
  const segments = normalized.split('/').filter(Boolean)
  return segments.at(-1) ?? value
}

export function dedupePreserveOrder(items: string[]) {
  const seen = new Set<string>()
  const result: string[] = []

  for (const item of items) {
    const normalized = item.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

export function getPreviewActions(previewPlan: SyncPlan | null) {
  const actions = previewPlan?.actions ?? []

  return {
    copies: actions.filter((action) => action.action === 'copy'),
    deletes: actions.filter((action) => action.action === 'delete'),
    skippedDeletes: actions.filter((action) => action.action === 'skip_delete'),
  }
}

export function getDriveStatus(
  selectedDrive: string | null,
  selectedCandidate: DriveCandidate | null,
) {
  if (!selectedDrive) {
    return { tone: 'offline' as const, label: 'Not connected' }
  }

  if (selectedCandidate?.isReachable) {
    return { tone: 'online' as const, label: `Connected to ${selectedDrive}:\\` }
  }

  return { tone: 'offline' as const, label: `${selectedDrive}:\\ unavailable` }
}

export function getScopedTerminalEntries(
  terminalEntries: TerminalEntry[],
  scope: SyncEventScope,
) {
  return terminalEntries.filter((entry) => entry.scope === scope)
}

export function getTransferFeedItems(
  transferLog: string[],
  syncTerminalEntries: TerminalEntry[],
) {
  const terminalCopies = syncTerminalEntries
    .map((entry) => entry.line)
    .filter((line) => line.startsWith('Copying '))

  return dedupePreserveOrder([...transferLog, ...terminalCopies])
}

export function getCleanupFeedItems(
  deletionLog: string[],
  syncTerminalEntries: TerminalEntry[],
) {
  const terminalDeletes = syncTerminalEntries
    .map((entry) => entry.line)
    .filter((line) => line.startsWith('Removing ') || line.startsWith('Removed '))

  return dedupePreserveOrder([...deletionLog, ...terminalDeletes])
}

export function getHomeCounts(
  enabledFolderCount: number,
  previewPlan: SyncPlan | null,
  summary: SyncSummary | null,
) {
  return [
    { label: 'Selected folders', value: enabledFolderCount.toString() },
    {
      label: 'Planned copies',
      value: previewPlan?.summary.copyCount?.toString() ?? summary?.plannedCopyFiles?.toString() ?? '0',
    },
    {
      label: 'Planned deletes',
      value:
        previewPlan?.summary.deleteCount?.toString() ?? summary?.plannedDeleteFiles?.toString() ?? '0',
    },
  ]
}

export function getHomePanelClassName(phase: RuntimePhase) {
  return [
    'panel',
    'highlight-panel',
    'runtime-panel',
    phase === 'running' ? 'runtime-panel--running' : '',
    phase === 'completed' ? 'runtime-panel--completed' : '',
    phase === 'error' ? 'runtime-panel--error' : '',
  ]
    .filter(Boolean)
    .join(' ')
}

export function statusTone(status: RunAuditRecord['status']) {
  return status === 'completed' ? 'online' : 'offline'
}

export function getRuntimeBadgeTone(phase: RuntimePhase) {
  switch (phase) {
    case 'running':
      return 'busy'
    case 'completed':
    case 'preview-ready':
      return 'online'
    case 'error':
      return 'offline'
    default:
      return 'neutral'
  }
}

export function getRuntimeStatusLabel(phase: RuntimePhase, scope: RuntimeScope) {
  switch (phase) {
    case 'running':
      return scope === 'preview' ? 'Running preview' : 'Running update'
    case 'preview-ready':
      return 'Preview ready'
    case 'completed':
      return 'Completed'
    case 'error':
      return 'Action required'
    default:
      return 'Idle'
  }
}

export function getRuntimeHeadline({
  isPreviewing,
  phase,
  previewCount,
  processedCount,
  processedTotal,
  runMessage,
  runtimeError,
}: {
  isPreviewing: boolean
  phase: RuntimePhase
  previewCount: number
  processedCount: number
  processedTotal: number
  runMessage: string
  runtimeError: string | null
}) {
  if (phase === 'error') {
    return runtimeError ?? 'Run failed.'
  }

  if (isPreviewing) {
    return 'Building preview plan and collecting file actions.'
  }

  if (phase === 'running') {
    return processedTotal > 0
      ? `Processing ${processedCount} of ${processedTotal} files.`
      : runMessage
  }

  if (phase === 'preview-ready') {
    return `${previewCount} planned actions ready for review.`
  }

  if (phase === 'completed') {
    return processedTotal > 0
      ? `Completed ${processedCount} of ${processedTotal} planned file actions.`
      : runMessage
  }

  return 'Choose a run mode to start syncing.'
}

export function getRuntimeCurrentTitle({
  homeTransferTitle,
  isPreviewing,
  phase,
  previewStatusMessage,
  runtimeError,
}: {
  homeTransferTitle: string
  isPreviewing: boolean
  phase: RuntimePhase
  previewStatusMessage: string
  runtimeError: string | null
}) {
  if (phase === 'error') {
    return 'Run needs attention'
  }

  if (isPreviewing) {
    return 'Preparing preview'
  }

  if (phase === 'preview-ready') {
    return 'Preview is ready'
  }

  if (phase === 'completed') {
    return 'Last run complete'
  }

  return homeTransferTitle || previewStatusMessage || runtimeError || 'No active transfer'
}

export function getRuntimeCurrentDetail({
  homeTransferDetail,
  isPreviewing,
  phase,
  previewStatusMessage,
  runtimeError,
}: {
  homeTransferDetail: string
  isPreviewing: boolean
  phase: RuntimePhase
  previewStatusMessage: string
  runtimeError: string | null
}) {
  if (phase === 'error') {
    return runtimeError ?? 'Review the logs and retry when ready.'
  }

  if (isPreviewing) {
    return previewStatusMessage
  }

  if (phase === 'preview-ready') {
    return 'Review planned copies, deletes, and retained firmware paths before updating.'
  }

  if (phase === 'completed') {
    return 'Review results or start another run.'
  }

  return homeTransferDetail
}
