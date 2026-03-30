export interface FirmwareRetentionViewProps {
  firmwareRetentionEnabled: boolean
  hasUnsavedChanges: boolean
  isSaving: boolean
  onApply: () => Promise<void>
  onReset: () => void
  onToggleRetention: () => void
}

export function FirmwareRetentionView({
  firmwareRetentionEnabled,
  hasUnsavedChanges,
  isSaving,
  onApply,
  onReset,
  onToggleRetention,
}: FirmwareRetentionViewProps) {
  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Firmware Retention</p>
          <h2>Protect `*\\Firmware\\*` deletes</h2>
        </div>
      </div>

      <button
        className={`retention-card ${firmwareRetentionEnabled ? 'is-on' : ''}`}
        onClick={onToggleRetention}
        type="button"
      >
        <div>
          <strong>
            {firmwareRetentionEnabled
              ? 'Firmware retention enabled'
              : 'Firmware retention disabled'}
          </strong>
          <p>
            When enabled, local files inside folders named `Firmware` are preserved even if the
            ShareFile source no longer contains them.
          </p>
        </div>
        <span className={`switch ${firmwareRetentionEnabled ? 'is-on' : ''}`}>
          <span className="switch-thumb" />
        </span>
      </button>

      <div className="action-row action-row--settings">
        <button
          className="primary-button"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={() => void onApply()}
          type="button"
        >
          Apply
        </button>
        <button
          className="secondary-button"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={onReset}
          type="button"
        >
          Cancel
        </button>
      </div>
    </section>
  )
}
