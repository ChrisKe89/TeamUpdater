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
    expect(merged.sourceMode).toBe('mapped-drive')
  })

  it('hydrates all known folders from defaults', () => {
    const defaults = buildDefaultSettings()
    const folderKeys = getFolderDefinitions().map((folder) => folder.key)

    expect(Object.keys(defaults.folders)).toEqual(folderKeys)
  })

  it('preserves sharefile api settings and destination root', () => {
    const merged = mergeSettings({
      sourceMode: 'sharefile-api',
      destinationRoot: 'D:\\Mirror',
      shareFileApi: {
        tenantSubdomain: 'tenant',
        rootItemId: 'root-1',
        rootDisplayPath: '/Shared/CUSP',
      },
    })

    expect(merged.sourceMode).toBe('sharefile-api')
    expect(merged.destinationRoot).toBe('D:\\Mirror')
    expect(merged.shareFileApi.tenantSubdomain).toBe('tenant')
    expect(merged.shareFileApi.rootItemId).toBe('root-1')
    expect(merged.shareFileApi.rootDisplayPath).toBe('/Shared/CUSP')
  })
})
