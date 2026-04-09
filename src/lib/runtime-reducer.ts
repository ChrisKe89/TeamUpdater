import { appendTerminalEntry, initialRunState, reduceSyncEvent } from './runtime'
import type { RuntimePhase, RuntimeScope } from './runtime'
import type { NavView, RunAuditRecord, SyncEvent, SyncPlan, SyncRunState, TerminalEntry } from '../types'

export interface RuntimeReducerState {
  phase: RuntimePhase
  scope: RuntimeScope
  error: string | null
  isPreviewing: boolean
  previewStatusMessage: string
  terminalEntries: TerminalEntry[]
  runState: SyncRunState
  previewPlan: SyncPlan | null
  activeView: NavView
  historyRecords: RunAuditRecord[]
  isInitializing: boolean
  isHistoryLoading: boolean
}

export type RuntimeAction =
  | { type: 'INIT_COMPLETE'; records: RunAuditRecord[] }
  | { type: 'INIT_FAILED' }
  | { type: 'SYNC_EVENT'; payload: SyncEvent }
  | { type: 'PREVIEW_INITIATED' }
  | { type: 'SYNC_INITIATED' }
  | { type: 'HISTORY_LOADING' }
  | { type: 'HISTORY_LOADED'; records: RunAuditRecord[] }
  | { type: 'HISTORY_FAILED' }
  | { type: 'SET_ACTIVE_VIEW'; view: NavView }

export const initialRuntimeState: RuntimeReducerState = {
  phase: 'idle',
  scope: null,
  error: null,
  isPreviewing: false,
  previewStatusMessage: 'Ready to generate a preview.',
  terminalEntries: [],
  runState: initialRunState,
  previewPlan: null,
  activeView: 'home',
  historyRecords: [],
  isInitializing: true,
  isHistoryLoading: true,
}

export function runtimeReducer(
  state: RuntimeReducerState,
  action: RuntimeAction,
): RuntimeReducerState {
  switch (action.type) {
    case 'INIT_COMPLETE':
      return { ...state, isInitializing: false, isHistoryLoading: false, historyRecords: action.records }

    case 'INIT_FAILED':
      return { ...state, isInitializing: false, isHistoryLoading: false }

    case 'SET_ACTIVE_VIEW':
      return { ...state, activeView: action.view }

    case 'HISTORY_LOADING':
      return { ...state, isHistoryLoading: true }

    case 'HISTORY_LOADED':
      return { ...state, isHistoryLoading: false, historyRecords: action.records }

    case 'HISTORY_FAILED':
      return { ...state, isHistoryLoading: false }

    case 'PREVIEW_INITIATED':
      return {
        ...state,
        phase: 'running',
        scope: 'preview',
        error: null,
        isPreviewing: true,
        previewStatusMessage: 'Preview queued.',
        terminalEntries: [],
        previewPlan: null,
        activeView: 'preview',
      }

    case 'SYNC_INITIATED':
      return {
        ...state,
        phase: 'running',
        scope: 'sync',
        error: null,
        previewPlan: null,
        previewStatusMessage: 'Ready to generate a preview.',
        terminalEntries: [],
        runState: { ...initialRunState, isRunning: true, lastMessage: 'Sync queued.' },
        activeView: 'home',
      }

    case 'SYNC_EVENT':
      return applySyncEvent(state, action.payload)
  }
}

function applySyncEvent(state: RuntimeReducerState, event: SyncEvent): RuntimeReducerState {
  switch (event.kind) {
    case 'preview_started':
      return {
        ...state,
        isPreviewing: true,
        phase: 'running',
        scope: 'preview',
        error: null,
        previewStatusMessage: event.message,
        terminalEntries: [],
      }

    case 'preview_completed':
      return {
        ...state,
        isPreviewing: false,
        phase: 'preview-ready',
        scope: 'preview',
        error: null,
        previewPlan: event.plan,
        activeView: 'preview',
        previewStatusMessage: event.message,
      }

    case 'preview_stopped':
      return {
        ...state,
        isPreviewing: false,
        phase: 'idle',
        previewStatusMessage: event.message,
      }

    case 'preview_failed':
      return {
        ...state,
        isPreviewing: false,
        phase: 'error',
        scope: 'preview',
        error: event.message,
        previewStatusMessage: event.message,
      }

    case 'log_line':
      return {
        ...state,
        terminalEntries: appendTerminalEntry(state.terminalEntries, event),
      }

    case 'run_started':
      return {
        ...state,
        phase: 'running',
        scope: 'sync',
        error: null,
        terminalEntries: [],
        runState: reduceSyncEvent(state.runState, event),
      }

    case 'run_completed':
    case 'run_stopped':
      return {
        ...state,
        phase: 'completed',
        scope: 'sync',
        error: null,
        runState: reduceSyncEvent(state.runState, event),
      }

    case 'run_failed':
      return {
        ...state,
        phase: 'error',
        scope: 'sync',
        error: event.message,
        runState: reduceSyncEvent(state.runState, event),
      }

    default:
      return { ...state, runState: reduceSyncEvent(state.runState, event) }
  }
}
