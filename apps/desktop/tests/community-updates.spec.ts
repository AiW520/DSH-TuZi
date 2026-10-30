import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommunityUpdates, communityInstalledVersion, selectCommunityRelease } from '../src/community-updates.ts'
import type { CommunityUpdateOptions } from '../src/community-updates.ts'

const installed = '0.2.1-rc.3-community.6'
const release = (number = 7) => ({ platform: 'Windows', arch: 'x64', version: `0.2.1-rc.3-community.${number}`,
  qualified: true, signing: 'unsigned-test', sha256: 'a'.repeat(64), bytes: 120,
  url: `https://github.com/AiW520/DSH-TuZi/releases/download/v0.2.1-rc.3-community.${number}/dsh-tuzi-0.2.1-rc.3-win-x64-unsigned.exe`,
  notes: 'Update notifications without automatic installation.' })
const feed = (...releases: unknown[]) => ({ schemaVersion: 1, releases })

describe('qualified release selection', () => {
  it('reads an explicit community version and refuses a base version or malformed metadata', () => {
    expect(communityInstalledVersion({ dshCommunityVersion: installed })).toBe(installed)
    for (const manifest of [null, {}, { version: installed }, { dshCommunityVersion: '0.2.1-rc.3' }, { dshCommunityVersion: 'v' + installed }]) {
      expect(communityInstalledVersion(manifest)).toBeNull()
    }
  })
  it('compares numeric preview versions and matches OS and installed architecture', () => {
    expect(selectCommunityRelease(feed(release(9), release(10)), 'Windows', 'x64')?.version).toBe('0.2.1-rc.3-community.10')
    expect(selectCommunityRelease(feed(release()), 'Windows', 'arm64')).toBeNull()
    expect(selectCommunityRelease(feed(release()), 'macOS', 'arm64')).toBeNull()
    expect(selectCommunityRelease(feed({ ...release(), qualified: false }), 'Windows', 'x64')).toBeNull()
  })
  it.each([
    { url: 'https://example.com/update.exe' }, { url: release().url + '?other=1' },
    { url: release().url.replace('AiW520', 'other') }, { url: release().url.replace('dsh-tuzi-', '../dsh-tuzi-') },
    { url: release().url.replace('.exe', '.dmg') }, { version: '0.2.1-rc.3-community.8' },
    { bytes: -1 }, { sha256: 'bad' }, { signing: 'unknown' }, { notes: '<x>'.repeat(5000) },
  ])('rejects unsafe or mismatched qualified metadata: %j', (change) => {
    expect(() => selectCommunityRelease(feed({ ...release(), ...change }), 'Windows', 'x64')).toThrow()
  })
  it('orders the upstream version separately from the community revision', () => {
    const make = (base: string, revision: number) => ({ ...release(), version: `${base}-community.${revision}`,
      url: `https://github.com/AiW520/DSH-TuZi/releases/download/v${base}-community.${revision}/dsh-tuzi-${base}-win-x64-unsigned.exe` })
    expect(selectCommunityRelease(feed(make('0.2.1-rc.9', 9), make('0.2.1-rc.10', 1)), 'Windows', 'x64')?.version)
      .toBe('0.2.1-rc.10-community.1')
    expect(selectCommunityRelease(feed(make('0.2.1-rc.10', 99), make('0.2.1', 1)), 'Windows', 'x64')?.version)
      .toBe('0.2.1-community.1')
  })
  it('rejects invalid feeds and ambiguous versions', () => {
    expect(() => selectCommunityRelease({}, 'Windows', 'x64')).toThrow()
    expect(() => selectCommunityRelease(feed(release(), release()), 'Windows', 'x64')).toThrow()
  })
})

describe('community notification lifecycle', () => {
  let directory: string
  const instances: CommunityUpdates[] = []
  let options: CommunityUpdateOptions
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-10-30T00:00:00Z'))
    directory = await mkdtemp(join(tmpdir(), 'community-updates-'))
    options = { version: installed, platform: 'Windows', arch: 'x64', preferencesPath: join(directory, 'preferences.json'),
      fetch: vi.fn(async () => Response.json(feed(release()))), publish: vi.fn(), openExternal: vi.fn(async () => {}) }
  })
  afterEach(async () => {
    await Promise.all(instances.splice(0).map(instance => instance.dispose()))
    vi.useRealTimers()
    await rm(directory, { recursive: true, force: true })
  })
  function create(change: Partial<CommunityUpdateOptions> = {}): CommunityUpdates {
    const instance = new CommunityUpdates({ ...options, ...change }); instances.push(instance); return instance
  }
  it('waits 30 seconds, checks every six hours, and coalesces overlapping checks', async () => {
    const notifier = create()
    await notifier.status()
    await notifier.check()
    expect(options.fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(30000)
    await notifier.check()
    expect(options.fetch).toHaveBeenCalledTimes(1)
    const first = notifier.check(true)
    expect(notifier.check(true)).toBe(first)
    await first
    await vi.advanceTimersByTimeAsync(6 * 3600000)
    await notifier.check()
    expect(options.fetch).toHaveBeenCalledTimes(3)
    expect(notifier.state.phase).toBe('available')
    expect(options.openExternal).not.toHaveBeenCalled()
  })
  it('consumes native menu requests once and preserves a newer request against a stale acknowledgement', async () => {
    const notifier = create()
    notifier.open(); await notifier.check(true)
    const first = notifier.state.openRequest
    notifier.open(); await notifier.check(true)
    const second = notifier.state.openRequest
    await notifier.act('acknowledge', undefined, first)
    expect(notifier.state.openRequest).toBe(second)
    await notifier.act('acknowledge', undefined, second)
    expect((await notifier.status()).openRequest).toBe(0)
  })
  it('persists ignore across restart, reveals it manually, and announces a newer version', async () => {
    const first = create()
    await first.check(true)
    await first.act('ignore', release().version)
    await first.dispose()
    const restarted = create()
    await restarted.check(true)
    expect(restarted.state.suppressed).toBe('ignored')
    expect(restarted.state.release?.version).toBe(release().version)
    expect(JSON.parse(await readFile(options.preferencesPath, 'utf8'))).toMatchObject({ ignored: release().version })
    const newer = create({ fetch: async () => Response.json(feed(release(8))) })
    await newer.check(true)
    expect(newer.state.suppressed).toBeNull()
  })
  it('persists a 24-hour snooze and expires it without dropping the release', async () => {
    const first = create(); await first.check(true); await first.act('later', release().version); await first.dispose()
    const restarted = create(); await restarted.check(true)
    expect(restarted.state.suppressed).toBe('snoozed')
    vi.setSystemTime(Date.now() + 24 * 3600000)
    expect(restarted.state.suppressed).toBeNull()
  })
  it('shows preference failures without pretending the choice was saved', async () => {
    await writeFile(options.preferencesPath, '{broken')
    const notifier = create({ save: async () => { throw new Error('read only') } })
    await notifier.check(true)
    expect(notifier.state.preferenceError).toBe(true)
    await expect(notifier.act('ignore', release().version)).rejects.toThrow('read only')
    expect(notifier.state.suppressed).toBeNull()
  })
  it('keeps background network failures quiet and backs off, with manual retry available', async () => {
    const notifier = create({ fetch: vi.fn(async () => { throw new Error('offline') }) })
    await notifier.check(true)
    expect(notifier.state.phase).toBe('error')
    expect(notifier.state.openRequest).toBe(0)
    await notifier.check()
    expect(options.openExternal).not.toHaveBeenCalled()
    notifier.open(); await notifier.check(true)
    expect(notifier.state.openRequest).toBe(1)
    expect(notifier.state.checkedAt).toBeNull()
  })
  it('aborts a slow request after 20 seconds and cancels retries on dispose', async () => {
    const fetcher: typeof fetch = vi.fn<typeof fetch>((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { reject(new Error('aborted')) }, { once: true })
    }))
    const notifier = create({ fetch: fetcher })
    await notifier.status()
    const pending = notifier.check(true)
    await vi.advanceTimersByTimeAsync(20000)
    await pending
    expect(notifier.state.phase).toBe('error')
    await vi.advanceTimersByTimeAsync(299999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await notifier.dispose()
    const calls = vi.mocked(options.publish).mock.calls.length
    await vi.advanceTimersByTimeAsync(24 * 3600000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(options.publish).toHaveBeenCalledTimes(calls)
  })
  it('does not publish late results when disposal races a transport response', async () => {
    let respond!: (response: Response) => void
    const notifier = create({ fetch: () => new Promise((resolve) => { respond = resolve }) })
    await notifier.status()
    const pending = notifier.check(true)
    await Promise.resolve()
    const calls = vi.mocked(options.publish).mock.calls.length
    const disposed = notifier.dispose()
    respond(Response.json(feed(release())))
    await Promise.all([pending, disposed])
    expect(options.publish).toHaveBeenCalledTimes(calls)
    expect(notifier.state.release).toBeNull()
  })
  it('only opens the validated release selected by an explicit action', async () => {
    const notifier = create(); await notifier.check(true)
    await expect(notifier.act('download', release(8).version)).rejects.toThrow('selection changed')
    expect(options.openExternal).not.toHaveBeenCalled()
    await notifier.act('download', release().version)
    expect(options.openExternal).toHaveBeenCalledWith(release().url)
    await notifier.act('notes', release().version)
    expect(options.openExternal).toHaveBeenLastCalledWith(notifier.state.release?.notesUrl)
  })
  it('announces a stable upstream release even when its community counter restarts', async () => {
    const stable = { ...release(), version: '0.2.1-community.1',
      url: 'https://github.com/AiW520/DSH-TuZi/releases/download/v0.2.1-community.1/dsh-tuzi-0.2.1-win-x64-unsigned.exe' }
    const notifier = create({ fetch: async () => Response.json(feed(stable)) })
    await notifier.check(true)
    expect(notifier.state.phase).toBe('available')
    expect(notifier.state.release?.version).toBe(stable.version)
  })
  it('distinguishes missing platform or identity, current versions, and feed failures', async () => {
    const unsupported = create({ arch: 'arm64' }); await unsupported.check(true)
    expect(unsupported.state.phase).toBe('unavailable')
    const older = create({ fetch: async () => Response.json(feed(release(5))) }); await older.check(true)
    expect(older.state.phase).toBe('current')
    const missing = create({ version: null }); await missing.check(true)
    expect(missing.state.phase).toBe('unavailable')
    const invalid = create({ fetch: async () => new Response('x'.repeat(256 * 1024 + 1)) }); await invalid.check(true)
    expect(invalid.state.phase).toBe('error')
  })
})
