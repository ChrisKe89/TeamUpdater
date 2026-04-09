import { useState } from 'react'
import './App.css'
import { NavButton } from './components/app-panels'
import { SyncRuntimeProvider, useSyncRuntimeContext } from './context/SyncRuntimeContext'
import { FirmwareRetentionView } from './views/FirmwareRetentionView'
import { FolderSelectionView } from './views/FolderSelectionView'
import { HistoryView } from './views/HistoryView'
import { HomeView } from './views/HomeView'
import { PreviewView } from './views/PreviewView'

function AppContent() {
  const runtime = useSyncRuntimeContext()
  const [isConsoleStatusCollapsed, setIsConsoleStatusCollapsed] = useState(false)

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-top">
          <div>
            <h1>TeamUpdater V3</h1>
          </div>
          <nav className="nav">
            <NavButton
              active={runtime.activeView === 'home'}
              label="Home"
              onClick={() => runtime.setActiveView('home')}
            />
            <NavButton
              active={runtime.activeView === 'preview'}
              label="Preview"
              onClick={() => runtime.setActiveView('preview')}
            />
            <NavButton
              active={runtime.activeView === 'history'}
              label="History"
              onClick={runtime.navigateToHistory}
            />
            <NavButton
              active={runtime.activeView === 'folder-selection'}
              label="Folder Selection"
              onClick={() => runtime.setActiveView('folder-selection')}
            />
            <NavButton
              active={runtime.activeView === 'firmware-retention'}
              label="Firmware Retention"
              onClick={() => runtime.setActiveView('firmware-retention')}
            />
          </nav>
        </div>
        <div className="sidebar-footer">
          <button
            className="utility-button utility-button--ghost sidebar-quit"
            onClick={() => void runtime.handleQuit()}
            type="button"
          >
            Quit
          </button>
        </div>
      </aside>

      <main className="content">
        {runtime.topLevelAppError ? (
          <div className="banner banner--error">{runtime.topLevelAppError}</div>
        ) : null}
        {runtime.appNotice ? (
          <div className="banner banner--success">{runtime.appNotice}</div>
        ) : null}

        {runtime.isInitializing ? (
          <section className="panel panel--loading">
            <div className="spinner" />
            <p>Loading ShareFile configuration...</p>
          </section>
        ) : null}

        {!runtime.isInitializing && runtime.activeView === 'home' ? (
          <HomeView
            isConsoleStatusCollapsed={isConsoleStatusCollapsed}
            setIsConsoleStatusCollapsed={setIsConsoleStatusCollapsed}
          />
        ) : null}
        {!runtime.isInitializing && runtime.activeView === 'preview' ? <PreviewView /> : null}
        {!runtime.isInitializing && runtime.activeView === 'history' ? <HistoryView /> : null}
        {!runtime.isInitializing && runtime.activeView === 'folder-selection' ? <FolderSelectionView /> : null}
        {!runtime.isInitializing && runtime.activeView === 'firmware-retention' ? <FirmwareRetentionView /> : null}
      </main>
    </div>
  )
}

function App() {
  return (
    <SyncRuntimeProvider>
      <AppContent />
    </SyncRuntimeProvider>
  )
}

export default App
