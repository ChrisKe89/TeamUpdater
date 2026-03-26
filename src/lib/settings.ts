import type { AppSettings, FolderDefinition } from '../types'

const folderDefinitions: FolderDefinition[] = [
  { key: 'CUSPAPPS', label: 'CUSPAPPS', isMandatory: true },
  { key: 'TeamCF', label: 'TeamCF', isMandatory: false },
  { key: 'TeamDT-A3', label: 'TeamDT-A3', isMandatory: false },
  { key: 'TeamDT-A4', label: 'TeamDT-A4', isMandatory: false },
  { key: 'TeamGC', label: 'TeamGC', isMandatory: false },
  { key: 'TeamHOSG', label: 'TeamHOSG', isMandatory: false },
  { key: 'TeamiGen', label: 'TeamiGen', isMandatory: false },
  { key: 'TeamOfficeworks', label: 'TeamOfficeworks', isMandatory: false },
  { key: 'TeamOSB', label: 'TeamOSB', isMandatory: true },
  { key: 'TeamOSG', label: 'TeamOSG', isMandatory: false },
  { key: 'TeamPrinters', label: 'TeamPrinters', isMandatory: false },
  { key: 'TeamProduction', label: 'TeamProduction', isMandatory: false },
  { key: 'TeamWF', label: 'TeamWF', isMandatory: false },
]

const defaultDestinationRoot = 'C:\\'

export function getFolderDefinitions() {
  return folderDefinitions
}

export function buildDefaultSettings(autoSelectedDrive: string | null = null): AppSettings {
  return {
    sourceMode: 'mapped-drive',
    selectedDrive: autoSelectedDrive,
    destinationRoot: defaultDestinationRoot,
    shareFileApi: {
      tenantSubdomain: '',
      rootItemId: null,
      rootDisplayPath: null,
    },
    firmwareRetentionEnabled: false,
    folders: folderDefinitions.reduce<Record<string, boolean>>((accumulator, folder) => {
      accumulator[folder.key] = folder.isMandatory
      return accumulator
    }, {}),
  }
}

export function mergeSettings(
  settings: Partial<AppSettings> | null | undefined,
  autoSelectedDrive: string | null = null,
): AppSettings {
  const defaults = buildDefaultSettings(autoSelectedDrive)
  const incomingFolders = settings?.folders ?? {}

  const mergedFolders = folderDefinitions.reduce<Record<string, boolean>>((accumulator, folder) => {
    const rawValue = incomingFolders[folder.key]
    accumulator[folder.key] =
      folder.isMandatory
        ? true
        : typeof rawValue === 'boolean'
          ? rawValue
          : defaults.folders[folder.key]
    return accumulator
  }, {})

  return {
    sourceMode: settings?.sourceMode ?? defaults.sourceMode,
    selectedDrive: settings?.selectedDrive ?? defaults.selectedDrive,
    destinationRoot:
      typeof settings?.destinationRoot === 'string' && settings.destinationRoot.trim().length > 0
        ? settings.destinationRoot
        : defaults.destinationRoot,
    shareFileApi: {
      tenantSubdomain: settings?.shareFileApi?.tenantSubdomain?.trim() ?? '',
      rootItemId: settings?.shareFileApi?.rootItemId ?? null,
      rootDisplayPath: settings?.shareFileApi?.rootDisplayPath ?? null,
    },
    firmwareRetentionEnabled:
      settings?.firmwareRetentionEnabled ?? defaults.firmwareRetentionEnabled,
    folders: mergedFolders,
  }
}
