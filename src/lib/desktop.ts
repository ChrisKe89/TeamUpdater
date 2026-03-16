import { invoke } from '@tauri-apps/api/core'
import type { AppSettings, DetectDrivesResponse } from '../types'
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
