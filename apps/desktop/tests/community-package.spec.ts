import { expect, it } from 'vitest'
import { localMacOSPackageEnvironment } from '../scripts/desktop-package-environment.mjs'
import { createElectronBuilderConfig } from '../scripts/electron-builder-config.mjs'

it('packages the community app without claiming the upstream identity or update channel', () => {
  const env = localMacOSPackageEnvironment({ DSH_TUZI_COMMUNITY: '1', DSH_DESKTOP_APP_ID: 'com.deepseek.harness' })
  const config = createElectronBuilderConfig(env, 'darwin', 'arm64')
  expect(config.appId).toBe('io.github.aiw520.dsh-tuzi')
  expect(config.productName).toBe('DSH-TuZi')
  expect(config.protocols).toEqual([{ name: 'DSH-TuZi', schemes: ['dsh-tuzi'] }])
  expect(config.publish).toBeNull()
  expect(config.extraMetadata).not.toHaveProperty('dshMandatoryUpdatePolicy')
  expect(config.extraMetadata).toHaveProperty('name', 'dsh-tuzi-desktop')
  expect(config.mac.icon).toContain('community-icon.png')
  expect(config.artifactName).toMatch(/^dsh-tuzi-.*unsigned/)
})

it('rejects community packaging with an upstream application identifier', () => {
  expect(() => createElectronBuilderConfig({
    DSH_TUZI_COMMUNITY: '1', DSH_DESKTOP_APP_ID: 'com.deepseek.harness', DSH_DESKTOP_UNSIGNED: '1',
  }, 'darwin', 'arm64')).toThrow('community application identifier')
})
