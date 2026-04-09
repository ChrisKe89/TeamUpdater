import { LogList } from '../components/app-panels'
import { useSyncRuntimeContext } from '../context/SyncRuntimeContext'
import { formatTimestamp, statusTone } from '../lib/runtime'

export function HistoryView() {
  const { historyRecords, isHistoryLoading, refreshHistory } = useSyncRuntimeContext()

  return (
    <section className="settings-panel">
      <section className="panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Run History</p>
            <h2>Persistent local audit trail</h2>
          </div>
          <button className="secondary-button" onClick={() => void refreshHistory()} type="button">
            Refresh history
          </button>
        </div>

        {isHistoryLoading ? <p className="empty-copy">Loading run history...</p> : null}

        {!isHistoryLoading && historyRecords.length === 0 ? (
          <p className="empty-copy">
            No completed, stopped, or failed runs have been recorded yet.
          </p>
        ) : null}

        <div className="history-list">
          {historyRecords.map((record) => (
            <article className="history-card" key={record.id}>
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">{record.status.replace('_', ' ')}</p>
                  <h2>{formatTimestamp(record.finishedAt)}</h2>
                </div>
                <span className={`status-pill status-pill--${statusTone(record.status)}`}>
                  <span className="status-dot" />
                  {record.status}
                </span>
              </div>
              <div className="history-section history-meta">
                <span className="history-chip">
                  Drive {record.selectedDrive ? `${record.selectedDrive}:\\` : 'n/a'}
                </span>
                <span className="history-chip">{record.enabledFolders.length} folders enabled</span>
                <span className="history-chip">
                  Firmware retention {record.firmwareRetentionEnabled ? 'on' : 'off'}
                </span>
              </div>
              <div className="history-section history-stats">
                <span>Copied {record.summary.copiedFiles}</span>
                <span>Deleted {record.summary.deletedFiles}</span>
                <span>Skipped deletes {record.summary.skippedDeletes}</span>
                <span>{record.summary.copiedBytesLabel || '0 bytes copied'}</span>
              </div>
              {record.errorMessage ? (
                <div className="banner banner--error">{record.errorMessage}</div>
              ) : null}
              <div className="history-section">
                <p className="history-section-title">Recent actions</p>
                <LogList
                  emptyDetail="Completed, stopped, or failed file actions will be listed here."
                  emptyTitle="No recent actions recorded"
                  items={record.recentActions}
                />
              </div>
            </article>
          ))}
        </div>
      </section>
    </section>
  )
}
