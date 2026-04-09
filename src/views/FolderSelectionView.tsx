import { useSyncRuntimeContext } from '../context/SyncRuntimeContext'

export function FolderSelectionView() {
  const {
    appNotice,
    draftSettings,
    enabledFolderCount,
    folderDefinitions,
    hasUnsavedChanges,
    isSaving,
    handleApplySettings,
    handleFolderToggle,
    handleResetSettings,
  } = useSyncRuntimeContext()

  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Folder Selection</p>
          <h2>Choose mirrored folders</h2>
        </div>
        <span className="hint-text">{enabledFolderCount} enabled</span>
      </div>

      <div className="folder-grid">
        {folderDefinitions.map((folder) => (
          <button
            className={`switch-row ${draftSettings.folders[folder.key] ? 'is-on' : ''}`}
            disabled={folder.isMandatory}
            key={folder.key}
            onClick={() => handleFolderToggle(folder)}
            type="button"
          >
            <span className="folder-copy">
              <strong>{folder.label}</strong>
            </span>
            <span className={`switch ${draftSettings.folders[folder.key] ? 'is-on' : ''}`}>
              <span className="switch-thumb" />
            </span>
          </button>
        ))}
      </div>

      <div className="action-row action-row--settings">
        {appNotice ? <span className="save-indicator">{appNotice}</span> : null}
        <button
          className="primary-button"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={() => void handleApplySettings()}
          type="button"
        >
          {isSaving ? 'Saving...' : 'Apply'}
        </button>
        <button
          className="secondary-button"
          disabled={!hasUnsavedChanges || isSaving}
          onClick={handleResetSettings}
          type="button"
        >
          Cancel
        </button>
      </div>
    </section>
  )
}
