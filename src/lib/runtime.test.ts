import { describe, expect, it } from 'vitest'
import type { TerminalEntry } from '../types'
import {
  appendTerminalEntry,
  getCleanupFeedItems,
  getDriveStatus,
  getHomeCounts,
  getPreviewActions,
  getScopedTerminalEntries,
  getTransferFeedItems,
  initialRunState,
  reduceSyncEvent,
} from './runtime'

describe('runtime helpers', () => {
  it('reduces sync lifecycle events into run state', () => {
    const started = reduceSyncEvent(initialRunState, {
      kind: 'run_started',
      message: 'Sync started.',
    })
    const inProgress = reduceSyncEvent(started, {
      kind: 'item_progress',
      displayName: 'file.txt',
      itemProgress: 50,
      message: 'Copying file.txt',
      overallProgress: 25,
      sourcePath: 'C:\\source\\file.txt',
    })
    const copied = reduceSyncEvent(inProgress, {
      kind: 'file_copied',
      destinationPath: 'C:\\file.txt',
      message: 'Copied C:\\file.txt',
      totalCopied: 1,
    })
    const completed = reduceSyncEvent(copied, {
      kind: 'run_completed',
      message: 'Sync complete.',
      summary: {
        copiedBytesLabel: '12 KB copied',
        copiedFiles: 1,
        deletedFiles: 0,
        plannedCopyFiles: 1,
        plannedDeleteFiles: 0,
        plannedSkippedDeletes: 0,
        skippedDeletes: 0,
      },
    })

    expect(completed.isRunning).toBe(false)
    expect(completed.currentItem?.displayName).toBe('file.txt')
    expect(completed.copiedCount).toBe(1)
    expect(completed.overallProgress).toBe(100)
    expect(completed.summary?.copiedFiles).toBe(1)
  })

  it('limits terminal history to the configured cap', () => {
    let entries: TerminalEntry[] = Array.from({ length: 400 }, (_, index) => ({
      line: `line ${index}`,
      scope: 'sync' as const,
      timestamp: String(index),
    }))

    entries = appendTerminalEntry(entries, {
      kind: 'log_line',
      line: 'overflow',
      scope: 'sync',
    })

    expect(entries).toHaveLength(400)
    expect(entries.at(-1)?.line).toBe('overflow')
    expect(entries.some((entry) => entry.line === 'line 0')).toBe(false)
  })

  it('derives preview actions, drive status, and feed items consistently', () => {
    const previewPlan = {
      actions: [
        {
          action: 'copy' as const,
          destinationPath: 'C:\\A.txt',
          folder: 'CUSPAPPS',
          reason: 'copy',
          sizeBytes: 10,
          sourcePath: 'Z:\\A.txt',
        },
        {
          action: 'delete' as const,
          destinationPath: 'C:\\B.txt',
          folder: 'CUSPAPPS',
          reason: 'delete',
          sizeBytes: null,
          sourcePath: null,
        },
        {
          action: 'skip_delete' as const,
          destinationPath: 'C:\\Firmware\\C.bin',
          folder: 'CUSPAPPS',
          reason: 'retain',
          sizeBytes: null,
          sourcePath: null,
        },
      ],
      destinationRoot: 'C:\\',
      firmwareRetentionEnabled: true,
      generatedAt: '1',
      selectedDrive: 'Z',
      sourceRoot: 'Z:\\',
      summary: {
        copyCount: 1,
        deleteCount: 1,
        skippedDeleteCount: 1,
        totalCopyBytes: 10,
        totalCopyBytesLabel: '10 bytes copied',
      },
    }

    const previewActions = getPreviewActions(previewPlan)
    const driveStatus = getDriveStatus('Z', {
      cuspDataPath: 'Z:\\Folders',
      isReachable: true,
      letter: 'Z',
      rootPath: 'Z:\\',
    })
    const transferFeedItems = getTransferFeedItems(['C:\\A.txt'], [
      { line: 'Copying C:\\A.txt', scope: 'sync', timestamp: '1' },
      { line: 'Copying C:\\A.txt', scope: 'sync', timestamp: '2' },
    ])
    const cleanupFeedItems = getCleanupFeedItems(['C:\\B.txt'], [
      { line: 'Removing C:\\B.txt', scope: 'sync', timestamp: '1' },
      { line: 'Removed C:\\B.txt', scope: 'sync', timestamp: '2' },
    ])
    const homeCounts = getHomeCounts(3, previewPlan, null)

    expect(previewActions.copies).toHaveLength(1)
    expect(previewActions.deletes).toHaveLength(1)
    expect(previewActions.skippedDeletes).toHaveLength(1)
    expect(driveStatus.label).toContain('Connected')
    expect(transferFeedItems).toEqual(['C:\\A.txt', 'Copying C:\\A.txt'])
    expect(cleanupFeedItems).toEqual(['C:\\B.txt', 'Removing C:\\B.txt', 'Removed C:\\B.txt'])
    expect(homeCounts.map((item) => item.value)).toEqual(['3', '1', '1'])
  })

  it('getScopedTerminalEntries returns entries matching the requested scope only', () => {
    const entries: TerminalEntry[] = [
      { line: 'sync line', scope: 'sync', timestamp: '1' },
      { line: 'preview line', scope: 'preview', timestamp: '2' },
      { line: 'sync line 2', scope: 'sync', timestamp: '3' },
    ]

    expect(getScopedTerminalEntries(entries, 'sync')).toEqual([
      { line: 'sync line', scope: 'sync', timestamp: '1' },
      { line: 'sync line 2', scope: 'sync', timestamp: '3' },
    ])
    expect(getScopedTerminalEntries(entries, 'preview')).toEqual([
      { line: 'preview line', scope: 'preview', timestamp: '2' },
    ])
  })

  it('covers idle drive and summary-derived home counts', () => {
    const previewActions = getPreviewActions(null)
    const driveStatus = getDriveStatus(null, null)
    const homeCounts = getHomeCounts(1, null, {
      copiedBytesLabel: '0 bytes copied',
      copiedFiles: 0,
      deletedFiles: 0,
      plannedCopyFiles: 5,
      plannedDeleteFiles: 2,
      plannedSkippedDeletes: 0,
      skippedDeletes: 0,
    })

    expect(previewActions).toEqual({
      copies: [],
      deletes: [],
      skippedDeletes: [],
    })
    expect(driveStatus).toEqual({
      label: 'Not connected',
      tone: 'offline',
    })
    expect(homeCounts.map((item) => item.value)).toEqual(['1', '5', '2'])
  })
})
