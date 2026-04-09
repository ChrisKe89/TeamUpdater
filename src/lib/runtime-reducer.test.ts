import { describe, expect, it } from 'vitest'
import { initialRuntimeState, runtimeReducer } from './runtime-reducer'

describe('runtimeReducer', () => {
  it('starts in initializing state', () => {
    expect(initialRuntimeState.isInitializing).toBe(true)
    expect(initialRuntimeState.phase).toBe('idle')
    expect(initialRuntimeState.scope).toBe(null)
  })

  it('INIT_COMPLETE clears loading flags and stores history', () => {
    const records = [{ id: '1' } as any]
    const next = runtimeReducer(initialRuntimeState, { type: 'INIT_COMPLETE', records })
    expect(next.isInitializing).toBe(false)
    expect(next.isHistoryLoading).toBe(false)
    expect(next.historyRecords).toBe(records)
  })

  it('INIT_FAILED clears loading flags', () => {
    const next = runtimeReducer(initialRuntimeState, { type: 'INIT_FAILED' })
    expect(next.isInitializing).toBe(false)
    expect(next.isHistoryLoading).toBe(false)
  })

  it('PREVIEW_INITIATED sets running state and navigates to preview', () => {
    const next = runtimeReducer(initialRuntimeState, { type: 'PREVIEW_INITIATED' })
    expect(next.phase).toBe('running')
    expect(next.scope).toBe('preview')
    expect(next.isPreviewing).toBe(true)
    expect(next.terminalEntries).toEqual([])
    expect(next.previewPlan).toBeNull()
    expect(next.activeView).toBe('preview')
    expect(next.error).toBeNull()
  })

  it('SYNC_INITIATED sets running state and navigates to home', () => {
    const next = runtimeReducer(initialRuntimeState, { type: 'SYNC_INITIATED' })
    expect(next.phase).toBe('running')
    expect(next.scope).toBe('sync')
    expect(next.runState.isRunning).toBe(true)
    expect(next.terminalEntries).toEqual([])
    expect(next.activeView).toBe('home')
    expect(next.error).toBeNull()
  })

  it('SYNC_EVENT preview_started updates preview state atomically', () => {
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'preview_started', message: 'Building plan...' },
    })
    expect(next.phase).toBe('running')
    expect(next.scope).toBe('preview')
    expect(next.isPreviewing).toBe(true)
    expect(next.previewStatusMessage).toBe('Building plan...')
    expect(next.terminalEntries).toEqual([])
    expect(next.error).toBeNull()
  })

  it('SYNC_EVENT preview_completed resolves to preview-ready and stores plan', () => {
    const plan = { actions: [], summary: {} } as any
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'preview_completed', plan, message: 'Done.' },
    })
    expect(next.phase).toBe('preview-ready')
    expect(next.isPreviewing).toBe(false)
    expect(next.previewPlan).toBe(plan)
    expect(next.activeView).toBe('preview')
  })

  it('SYNC_EVENT preview_failed sets error state', () => {
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'preview_failed', message: 'Network error' },
    })
    expect(next.phase).toBe('error')
    expect(next.scope).toBe('preview')
    expect(next.error).toBe('Network error')
    expect(next.isPreviewing).toBe(false)
  })

  it('SYNC_EVENT run_completed transitions to completed', () => {
    const summary = { copiedFiles: 3 } as any
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'run_completed', summary, message: 'Done.' },
    })
    expect(next.phase).toBe('completed')
    expect(next.scope).toBe('sync')
    expect(next.error).toBeNull()
  })

  it('SYNC_EVENT run_failed sets error state', () => {
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'run_failed', message: 'Disk full' },
    })
    expect(next.phase).toBe('error')
    expect(next.scope).toBe('sync')
    expect(next.error).toBe('Disk full')
  })

  it('SYNC_EVENT log_line appends a terminal entry', () => {
    const next = runtimeReducer(initialRuntimeState, {
      type: 'SYNC_EVENT',
      payload: { kind: 'log_line', scope: 'sync', line: 'Copying file.txt' },
    })
    expect(next.terminalEntries).toHaveLength(1)
    expect(next.terminalEntries[0].line).toBe('Copying file.txt')
  })

  it('HISTORY_LOADING / HISTORY_LOADED round-trip', () => {
    const loading = runtimeReducer(initialRuntimeState, { type: 'HISTORY_LOADING' })
    expect(loading.isHistoryLoading).toBe(true)

    const records = [{ id: '2' } as any]
    const loaded = runtimeReducer(loading, { type: 'HISTORY_LOADED', records })
    expect(loaded.isHistoryLoading).toBe(false)
    expect(loaded.historyRecords).toBe(records)
  })

  it('SET_ACTIVE_VIEW changes only the active view', () => {
    const next = runtimeReducer(initialRuntimeState, { type: 'SET_ACTIVE_VIEW', view: 'history' })
    expect(next.activeView).toBe('history')
    expect(next.phase).toBe(initialRuntimeState.phase)
  })
})
