import { useEffect, useRef } from 'react'
import {
  clampProgress,
  formatProgress,
  getPathLeaf,
} from '../lib/runtime'
import type { SyncPlanAction, TerminalEntry } from '../types'

export function NavButton({
  active,
  label,
  onClick,
}: {
  active: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button className={`nav-button ${active ? 'is-active' : ''}`} onClick={onClick} type="button">
      <strong>{label}</strong>
    </button>
  )
}

export function StatCard({
  density = 'default',
  detail,
  label,
  value,
}: {
  density?: 'compact' | 'compact-meta' | 'default'
  detail?: string
  label: string
  value: string
}) {
  return (
    <article className={`stat-card stat-card--${density}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {detail ? <span>{detail}</span> : null}
    </article>
  )
}

export function ProgressBar({
  detail,
  label,
  progressLabel,
  value,
}: {
  detail?: string
  label: string
  progressLabel?: string
  value: number
}) {
  const safeValue = clampProgress(value)

  return (
    <div className="progress-bar">
      <div className="progress-labels">
        <span>{label}</span>
        <span>{progressLabel ?? `${formatProgress(safeValue)}%`}</span>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill ${safeValue > 0 && safeValue < 100 ? 'is-animated' : ''}`}
          style={{ width: `${safeValue}%` }}
        />
      </div>
      {detail ? <p className="progress-detail">{detail}</p> : null}
    </div>
  )
}

export function PlanPanel({
  actions,
  className,
  eyebrow,
  emptyDetail,
  emptyTitle,
  isOpen,
  onToggle,
  title,
}: {
  actions: SyncPlanAction[]
  className?: string
  eyebrow: string
  emptyDetail: string
  emptyTitle: string
  isOpen: boolean
  onToggle: () => void
  title: string
}) {
  return (
    <section
      className={`panel plan-panel ${className ?? ''} ${isOpen ? 'is-open' : 'is-collapsed'}`.trim()}
    >
      <div className="panel-heading">
        <button
          aria-expanded={isOpen}
          className="section-toggle"
          onClick={onToggle}
          type="button"
        >
          <span className="section-kicker">{eyebrow}</span>
          <h2>{title}</h2>
        </button>
        <div className="panel-actions">
          <span className="counter-badge">{actions.length}</span>
          <CollapseButton isOpen={isOpen} onToggle={onToggle} title={`Toggle ${title}`} />
        </div>
      </div>
      {!isOpen ? null : actions.length === 0 ? (
        <EmptyState detail={emptyDetail} title={emptyTitle} />
      ) : (
        <div className="plan-list">
          {actions.map((action, index) => (
            <article className="plan-card" key={`${action.destinationPath}-${index}`}>
              <strong title={action.destinationPath}>{getPathLeaf(action.destinationPath)}</strong>
              <span title={action.sourcePath ?? action.destinationPath}>
                {action.sourcePath ?? action.destinationPath}
              </span>
              <span className="plan-status">{action.reason}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export function TerminalPanel({
  entries,
  isCollapsible = false,
  isOpen = true,
  onCancel,
  onToggle,
  status,
  title,
}: {
  entries: TerminalEntry[]
  isCollapsible?: boolean
  isOpen?: boolean
  onCancel?: () => void
  onToggle?: () => void
  status: string
  title: string
}) {
  const isExpanded = !isCollapsible || isOpen
  const terminalWindowRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isExpanded || !terminalWindowRef.current) {
      return
    }

    terminalWindowRef.current.scrollTop = 1e9
  }, [entries, isExpanded])

  return (
    <section className={`panel terminal-panel ${isExpanded ? 'is-open' : 'is-collapsed'}`.trim()}>
      <div className="panel-heading">
        {isCollapsible ? (
          <button
            aria-expanded={isExpanded}
            className="section-toggle"
            onClick={onToggle}
            type="button"
          >
            <span className="section-kicker">Verbose output</span>
            <h2>{title}</h2>
          </button>
        ) : (
          <div>
            <span className="section-kicker">Verbose output</span>
            <h2>{title}</h2>
          </div>
        )}
        <div className="panel-actions">
          {onCancel ? (
            <button className="utility-button utility-button--danger" onClick={onCancel} type="button">
              Cancel
            </button>
          ) : null}
          {isCollapsible ? (
            <CollapseButton isOpen={isExpanded} onToggle={onToggle} title={`Toggle ${title}`} />
          ) : null}
        </div>
      </div>

      {isExpanded ? (
        <>
          <p className="terminal-status">{status}</p>

          <div className="terminal-window" ref={terminalWindowRef} role="log" aria-live="polite">
            {entries.length === 0 ? (
              <EmptyState
                detail="Logs will appear here when preview or update starts."
                title="No terminal output yet"
              />
            ) : (
              entries.map((entry, index) => (
                <div className="terminal-line" key={`${entry.timestamp}-${index}`}>
                  <span className="terminal-timestamp">{entry.timestamp}</span>
                  <span>{entry.line}</span>
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </section>
  )
}

export function CollapsibleLogPanel({
  count,
  emptyDetail,
  emptyTitle,
  eyebrow,
  isOpen,
  items,
  onToggle,
  title,
}: {
  count: number
  emptyDetail: string
  emptyTitle: string
  eyebrow: string
  isOpen: boolean
  items: string[]
  onToggle: () => void
  title: string
}) {
  return (
    <section className={`panel log-panel ${isOpen ? 'is-open' : 'is-collapsed'}`.trim()}>
      <div className="panel-heading">
        <button
          aria-expanded={isOpen}
          className="section-toggle"
          onClick={onToggle}
          type="button"
        >
          <span className="section-kicker">{eyebrow}</span>
          <h2>{title}</h2>
        </button>
        <div className="panel-actions">
          <span className="counter-badge">{count}</span>
          <CollapseButton isOpen={isOpen} onToggle={onToggle} title={`Toggle ${title}`} />
        </div>
      </div>
      {isOpen ? <LogList emptyDetail={emptyDetail} emptyTitle={emptyTitle} items={items} /> : null}
    </section>
  )
}

export function CollapseButton({
  isOpen,
  onToggle,
  title,
}: {
  isOpen: boolean
  onToggle?: () => void
  title: string
}) {
  return (
    <button
      aria-expanded={isOpen}
      aria-label={title}
      className="utility-button utility-button--icon"
      onClick={onToggle}
      title={title}
      type="button"
    >
      {isOpen ? '▾' : '▸'}
    </button>
  )
}

export function EmptyState({ detail, title }: { detail: string; title: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  )
}

export function LogList({
  emptyDetail,
  emptyTitle,
  items,
}: {
  emptyDetail: string
  emptyTitle: string
  items: string[]
}) {
  if (items.length === 0) {
    return <EmptyState detail={emptyDetail} title={emptyTitle} />
  }

  return (
    <ol className="log-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ol>
  )
}
