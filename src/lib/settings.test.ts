import { describe, expect, it } from 'vitest'
import { buildDefaultSettings, getFolderDefinitions, mergeSettings } from './settings'

describe('settings helpers', () => {
  it('forces mandatory folders on', () => {
    const merged = mergeSettings({
      folders: {
        CUSPAPPS: false,
        TeamOSB: false,
      },
    })

    expect(merged.folders.CUSPAPPS).toBe(true)
    expect(merged.folders.TeamOSB).toBe(true)
  })

  it('keeps the configured drive when present', () => {
    const merged = mergeSettings({ selectedDrive: 'S' }, 'Z')
    expect(merged.selectedDrive).toBe('S')
  })

  it('hydrates all known folders from defaults', () => {
    const defaults = buildDefaultSettings()
    const folderKeys = getFolderDefinitions().map((folder) => folder.key)

    expect(Object.keys(defaults.folders)).toEqual(folderKeys)
  })
})
