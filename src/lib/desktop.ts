import { invoke } from '@tauri-apps/api/core'
import type {
  AppSettings,
  DetectDrivesResponse,
  RunAuditRecord,
  ShareFileAuthConfig,
  ShareFileAuthSession,
  ShareFileAuthStatus,
  ShareFileBrowseNode,
  SyncPlan,
} from '../types'
import { buildDefaultSettings, mergeSettings } from './settings'

export const isDesktopRuntime =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const browserStorageKey = 'teamupdater-v3-settings'

export async function detectShareFileDrives(): Promise<DetectDrivesResponse> {
  if (isDesktopRuntime) {
    return invoke<DetectDrivesResponse>('detect_sharefile_drives')
  }

  return {
    candidates: [],
    autoSelected: null,
  }
}

export async function loadSettings(): Promise<AppSettings> {
  if (isDesktopRuntime) {
    return invoke<AppSettings>('load_settings')
  }

  const rawSettings = window.localStorage.getItem(browserStorageKey)

  if (!rawSettings) {
    return buildDefaultSettings()
  }

  try {
    return mergeSettings(JSON.parse(rawSettings) as Partial<AppSettings>)
  } catch {
    return buildDefaultSettings()
  }
}

export async function saveSettings(settings: AppSettings) {
  if (isDesktopRuntime) {
    return invoke<void>('save_settings', { settings })
  }

  window.localStorage.setItem(browserStorageKey, JSON.stringify(settings))
}

export async function previewSyncPlan(settings: AppSettings): Promise<SyncPlan> {
  if (!isDesktopRuntime) {
    throw new Error('Preview is only available in the Tauri desktop runtime.')
  }

  return invoke<SyncPlan>('preview_sync_plan', { settings })
}

export async function startPreview(settings: AppSettings) {
  if (!isDesktopRuntime) {
    throw new Error('Preview is only available in the Tauri desktop runtime.')
  }

  return invoke<void>('start_preview', { settings })
}

export async function loadRunHistory(): Promise<RunAuditRecord[]> {
  if (!isDesktopRuntime) {
    return []
  }

  return invoke<RunAuditRecord[]>('load_run_history')
}

export async function startSync(settings: AppSettings) {
  if (!isDesktopRuntime) {
    throw new Error('The sync engine is only available in the Tauri desktop runtime.')
  }

  return invoke<void>('start_sync', { settings })
}

export async function requestSyncStop() {
  if (!isDesktopRuntime) {
    throw new Error('Stop requests are only available in the Tauri desktop runtime.')
  }

  return invoke<void>('request_sync_stop')
}

export async function requestPreviewStop() {
  if (!isDesktopRuntime) {
    throw new Error('Stop requests are only available in the Tauri desktop runtime.')
  }

  return invoke<void>('request_preview_stop')
}

export async function getShareFileAuthStatus(): Promise<ShareFileAuthStatus> {
  if (!isDesktopRuntime) {
    return {
      isAuthenticated: false,
      tenantSubdomain: null,
      expiresAt: null,
      hasRefreshToken: false,
      authUrl: null,
      message: 'ShareFile auth is only available in the desktop runtime.',
    }
  }

  return invoke<ShareFileAuthStatus>('get_sharefile_auth_status')
}

export async function beginShareFileAuth(
  config: ShareFileAuthConfig,
): Promise<ShareFileAuthSession> {
  if (!isDesktopRuntime) {
    throw new Error('ShareFile auth is only available in the Tauri desktop runtime.')
  }

  return invoke<ShareFileAuthSession>('begin_sharefile_auth', { config })
}

export async function completeShareFileAuth(
  callbackUrl: string,
): Promise<ShareFileAuthStatus> {
  if (!isDesktopRuntime) {
    throw new Error('ShareFile auth is only available in the Tauri desktop runtime.')
  }

  return invoke<ShareFileAuthStatus>('complete_sharefile_auth', { callbackUrl })
}

export async function listShareFileRootItems(): Promise<ShareFileBrowseNode[]> {
  if (!isDesktopRuntime) {
    return []
  }

  return invoke<ShareFileBrowseNode[]>('list_sharefile_root_items')
}

export async function browseShareFileFolder(parentId: string): Promise<ShareFileBrowseNode[]> {
  if (!isDesktopRuntime) {
    return []
  }

  return invoke<ShareFileBrowseNode[]>('browse_sharefile_folder', { parentId })
}

export async function disconnectShareFileAccount() {
  if (!isDesktopRuntime) {
    return
  }

  return invoke<void>('disconnect_sharefile_account')
}

export async function writeClientLog(level: string, message: string) {
  if (!isDesktopRuntime) {
    if (level === 'ERROR') {
      console.error(message)
      return
    }

    console.log(message)
    return
  }

  return invoke<void>('write_client_log', { level, message })
}

export async function quitApp() {
  if (!isDesktopRuntime) {
    return
  }

  return invoke<void>('quit_app')
}
