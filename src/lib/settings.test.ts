import { describe, expect, it } from 'vitest'
import { areSettingsEqual, buildDefaultSettings, getFolderDefinitions, mergeSettings } from './settings'

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

  it('compares settings without relying on object serialization order', () => {
    const left = buildDefaultSettings('S')
    const right = {
      ...buildDefaultSettings('S'),
      folders: Object.fromEntries([...Object.entries(left.folders)].reverse()),
    }

    expect(areSettingsEqual(left, right)).toBe(true)
    expect(
      areSettingsEqual(left, {
        ...right,
        firmwareRetentionEnabled: true,
      }),
    ).toBe(false)
  })
})
