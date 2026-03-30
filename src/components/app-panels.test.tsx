import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CollapsibleLogPanel, TerminalPanel } from './app-panels'

describe('app panels', () => {
  it('renders terminal output and cancel action', () => {
    const onCancel = vi.fn()

    render(
      <TerminalPanel
        entries={[
          { line: 'Copying file.txt', scope: 'sync', timestamp: '10:00:00' },
        ]}
        onCancel={onCancel}
        status="Running"
        title="Execution terminal"
      />,
    )

    expect(screen.getByRole('heading', { name: 'Execution terminal' })).toBeInTheDocument()
    expect(screen.getByText('Copying file.txt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('shows empty state content for collapsed log panels with no items', () => {
    render(
      <CollapsibleLogPanel
        count={0}
        emptyDetail="No actions yet."
        emptyTitle="No entries"
        eyebrow="Transfer Feed"
        isOpen
        items={[]}
        onToggle={() => undefined}
        title="New files"
      />,
    )

    expect(screen.getByText('No entries')).toBeInTheDocument()
    expect(screen.getByText('No actions yet.')).toBeInTheDocument()
  })
})
