export type NavView = 'home' | 'folder-selection' | 'firmware-retention'

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
  copiedBytesLabel: string
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

export type SyncEvent =
  | RunStartedEvent
  | ItemProgressEvent
  | FileCopiedEvent
  | FileDeletedEvent
  | RunCompletedEvent
  | RunStoppedEvent
  | RunFailedEvent
