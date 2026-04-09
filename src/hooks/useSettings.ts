// src/hooks/useSettings.ts
import { useMemo, useState } from 'react'
import { saveSettings } from '../lib/desktop'
import { areSettingsEqual, buildDefaultSettings, mergeSettings } from '../lib/settings'
import { getErrorMessage } from '../lib/errors'
import type { AppSettings, FolderDefinition } from '../types'

export interface UseSettingsOptions {
  onError: (message: string | null) => void
  onNotice: (message: string | null) => void
  folderDefinitions: FolderDefinition[]
}

export interface UseSettingsResult {
  settings: AppSettings
  draftSettings: AppSettings
  isSaving: boolean
  hasUnsavedChanges: boolean
  hydrate: (loadedSettings: AppSettings, autoSelectedDrive: string | null, folderDefinitions: FolderDefinition[]) => void
  persistSettings: (nextSettings: AppSettings) => Promise<void>
  handleResetSettings: () => void
  handleFolderToggle: (folder: FolderDefinition) => void
  handleFirmwareRetentionToggle: () => void
  setSelectedDrive: (drive: string | null) => void
}

export function useSettings({ onError, onNotice, folderDefinitions }: UseSettingsOptions): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings>(buildDefaultSettings(folderDefinitions))
  const [draftSettings, setDraftSettings] = useState<AppSettings>(buildDefaultSettings(folderDefinitions))
  const [isSaving, setIsSaving] = useState(false)

  const hasUnsavedChanges = useMemo(
    () => !areSettingsEqual(folderDefinitions, settings, draftSettings),
    [folderDefinitions, settings, draftSettings],
  )

  const hydrate = (
    loadedSettings: AppSettings,
    autoSelectedDrive: string | null,
    folderDefinitions: FolderDefinition[],
  ) => {
    const merged = mergeSettings(folderDefinitions, loadedSettings, autoSelectedDrive)
    setSettings(merged)
    setDraftSettings(merged)
  }

  const persistSettings = async (nextSettings: AppSettings) => {
    setIsSaving(true)
    onError(null)
    onNotice(null)
    try {
      await saveSettings(nextSettings)
      setSettings(nextSettings)
      setDraftSettings(nextSettings)
      onNotice('Settings saved.')
    } catch (error) {
      onError(getErrorMessage(error, 'Unable to save settings.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetSettings = () => {
    setDraftSettings(settings)
    onError(null)
    onNotice(null)
  }

  const handleFolderToggle = (folder: FolderDefinition) => {
    if (folder.isMandatory) return
    setDraftSettings((previous) => ({
      ...previous,
      folders: { ...previous.folders, [folder.key]: !previous.folders[folder.key] },
    }))
  }

  const handleFirmwareRetentionToggle = () => {
    setDraftSettings((previous) => ({
      ...previous,
      firmwareRetentionEnabled: !previous.firmwareRetentionEnabled,
    }))
  }

  const setSelectedDrive = (drive: string | null) => {
    setDraftSettings((previous) => ({ ...previous, selectedDrive: drive }))
  }

  return {
    settings,
    draftSettings,
    isSaving,
    hasUnsavedChanges,
    hydrate,
    persistSettings,
    handleResetSettings,
    handleFolderToggle,
    handleFirmwareRetentionToggle,
    setSelectedDrive,
  }
}
