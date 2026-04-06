import { invoke } from '@tauri-apps/api/core'
import type { AppSettings, DetectDrivesResponse, FolderDefinition, RunAuditRecord } from '../types'
import { buildDefaultSettings, mergeSettings } from './settings'

export const isDesktopRuntime =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

const browserStorageKey = 'teamupdater-v3-settings'

export async function getFolderDefinitions(): Promise<FolderDefinition[]> {
  if (isDesktopRuntime) {
    const defs = await invoke<{ key: string; isMandatory: boolean }[]>('get_folder_definitions')
    return defs.map((def) => ({ key: def.key, label: def.key, isMandatory: def.isMandatory }))
  }
  // Browser fallback: use static list
  const { getFolderDefinitions: getStatic } = await import('./settings')
  return getStatic()
}

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
    const { getFolderDefinitions: getStatic } = await import('./settings')
    return buildDefaultSettings(getStatic())
  }

  try {
    const { getFolderDefinitions: getStatic } = await import('./settings')
    return mergeSettings(getStatic(), JSON.parse(rawSettings) as Partial<AppSettings>)
  } catch {
    const { getFolderDefinitions: getStatic } = await import('./settings')
    return buildDefaultSettings(getStatic())
  }
}

export async function saveSettings(settings: AppSettings) {
  if (isDesktopRuntime) {
    return invoke<void>('save_settings', { settings })
  }

  window.localStorage.setItem(browserStorageKey, JSON.stringify(settings))
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

export async function requestStop() {
  if (!isDesktopRuntime) {
    throw new Error('Stop requests are only available in the Tauri desktop runtime.')
  }

  return invoke<void>('request_stop')
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
