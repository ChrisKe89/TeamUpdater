export type NavView = 'home' | 'preview' | 'history' | 'folder-selection' | 'firmware-retention'

export interface FolderDefinition {
  key: string
  label: string
  isMandatory: boolean
}

export interface AppSettings {
  selectedDrive: string | null
  firmwareRetentionEnabled: boolean
  folders: Record<string, boolean>
}

export interface DriveCandidate {
  letter: string
  rootPath: string
  cuspDataPath: string
  isReachable: boolean
}

export interface DetectDrivesResponse {
  candidates: DriveCandidate[]
  autoSelected: string | null
}

export interface SyncCurrentItem {
  displayName: string
  sourcePath: string
}

export interface SyncSummary {
  copiedFiles: number
  deletedFiles: number
  skippedDeletes: number
  plannedCopyFiles: number
  plannedDeleteFiles: number
  plannedSkippedDeletes: number
  copiedBytesLabel: string
}

export type SyncPlanActionKind = 'copy' | 'delete' | 'skip_delete'

export interface SyncPlanAction {
  action: SyncPlanActionKind
  folder: string
  sourcePath: string | null
  destinationPath: string
  reason: string
  sizeBytes: number | null
}

export interface SyncPlanSummary {
  copyCount: number
  deleteCount: number
  skippedDeleteCount: number
  totalCopyBytes: number
  totalCopyBytesLabel: string
}

export interface SyncPlan {
  generatedAt: string
  selectedDrive: string
  sourceRoot: string
  destinationRoot: string
  firmwareRetentionEnabled: boolean
  actions: SyncPlanAction[]
  summary: SyncPlanSummary
}

export type RunAuditStatus = 'completed' | 'stopped' | 'failed'

export interface RunAuditRecord {
  id: string
  startedAt: string
  finishedAt: string
  status: RunAuditStatus
  selectedDrive: string | null
  sourceRoot: string | null
  destinationRoot: string
  enabledFolders: string[]
  firmwareRetentionEnabled: boolean
  summary: SyncSummary
  errorMessage: string | null
  recentActions: string[]
}

export interface SyncRunState {
  isRunning: boolean
  currentItem: SyncCurrentItem | null
  itemProgress: number
  overallProgress: number
  copiedCount: number
  deletedCount: number
  transferLog: string[]
  deletionLog: string[]
  summary: SyncSummary | null
  lastMessage: string
}

export type SyncEventScope = 'preview' | 'sync'

export interface TerminalEntry {
  scope: SyncEventScope
  line: string
  timestamp: string
}

interface PreviewStartedEvent {
  kind: 'preview_started'
  message: string
}

interface PreviewCompletedEvent {
  kind: 'preview_completed'
  plan: SyncPlan
  message: string
}

interface PreviewStoppedEvent {
  kind: 'preview_stopped'
  message: string
}

interface PreviewFailedEvent {
  kind: 'preview_failed'
  message: string
}

interface RunStartedEvent {
  kind: 'run_started'
  message: string
}

interface ItemProgressEvent {
  kind: 'item_progress'
  displayName: string
  sourcePath: string
  itemProgress: number
  overallProgress: number
  message: string
}

interface FileCopiedEvent {
  kind: 'file_copied'
  destinationPath: string
  totalCopied: number
  message: string
}

interface FileDeletedEvent {
  kind: 'file_deleted'
  destinationPath: string
  totalDeleted: number
  message: string
}

interface RunCompletedEvent {
  kind: 'run_completed'
  summary: SyncSummary
  message: string
}

interface RunStoppedEvent {
  kind: 'run_stopped'
  summary: SyncSummary
  message: string
}

interface RunFailedEvent {
  kind: 'run_failed'
  message: string
}

interface LogLineEvent {
  kind: 'log_line'
  scope: SyncEventScope
  line: string
}

export type SyncEvent =
  | PreviewStartedEvent
  | PreviewCompletedEvent
  | PreviewStoppedEvent
  | PreviewFailedEvent
  | RunStartedEvent
  | ItemProgressEvent
  | FileCopiedEvent
  | FileDeletedEvent
  | RunCompletedEvent
  | RunStoppedEvent
  | RunFailedEvent
  | LogLineEvent
