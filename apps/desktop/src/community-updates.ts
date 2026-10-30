/** Qualified community release checks, bounded network requests, and durable reminder preferences. */
import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { compare, valid } from 'semver'
import type { CommunityRelease, CommunityUpdateAction, CommunityUpdateState } from './community-update-protocol.ts'

const FEED = 'https://aiw520.github.io/DSH-TuZi/releases.json'
const REPOSITORY = 'https://github.com/AiW520/DSH-TuZi/releases/'
const INTERVAL = 6 * 60 * 60 * 1000
const SNOOZE = 24 * 60 * 60 * 1000
const MAX_FEED_BYTES = 256 * 1024

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Read a full community version from packaged metadata; missing identity disables comparison.
 * @param manifest - Parsed installed package.json.
 * @returns Valid community version, or null for older and development packages.
 */
export function communityInstalledVersion(manifest: unknown): string | null {
  if (!object(manifest)) return null
  const value = manifest.dshCommunityVersion
  return typeof value === 'string' && valid(value) === value && /-community\.\d+$/.test(value) ? value : null
}

/** Select only qualified, unambiguous installers from the owned GitHub release repository.
 * @param feed - Untrusted release manifest.
 * @param platform - Installed OS, such as Windows or macOS.
 * @param arch - Installed executable architecture, not browser inference.
 * @returns Latest matching release, or null when none is qualified.
 */
export function selectCommunityRelease(feed: unknown, platform: string, arch: string): CommunityRelease | null {
  if (!object(feed) || feed.schemaVersion !== 1 || !Array.isArray(feed.releases) || feed.releases.length > 200) {
    throw new Error('Invalid community release feed')
  }
  const releases: CommunityRelease[] = []
  for (const item of feed.releases) {
    if (!object(item) || item.platform !== platform || item.arch !== arch || item.qualified !== true) continue
    const { version, bytes, sha256, signing, url } = item
    const extension = platform === 'Windows' ? 'exe' : platform === 'macOS' ? 'dmg' : 'AppImage'
    const os = platform === 'Windows' ? 'win' : platform === 'macOS' ? 'mac' : 'linux'
    const artifactPattern = new RegExp(`^dsh-tuzi-[a-zA-Z0-9.-]+-${os}-${arch}(?:-unsigned)?\\.${extension}$`)
    if (typeof version !== 'string' || valid(version) !== version || !/-community\.\d+$/.test(version)
      || typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes <= 0
      || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)
      || (signing !== 'unsigned-test' && signing !== 'signed') || typeof url !== 'string'
      || !url.startsWith(`${REPOSITORY}download/v${version}/`)
      || !artifactPattern.test(url.slice(`${REPOSITORY}download/v${version}/`.length))
      || (item.notes !== undefined && (typeof item.notes !== 'string' || item.notes.length > 12000))) {
      throw new Error('Invalid qualified community installer')
    }
    const parsed = new URL(url)
    if (parsed.href !== url || parsed.search || parsed.hash) throw new Error('Invalid installer URL')
    const release: CommunityRelease = { version, bytes, sha256, signing, url, notesUrl: `${REPOSITORY}tag/v${version}`,
      notes: typeof item.notes === 'string' ? item.notes : '' }
    if (releases.some(previous => previous.version === version)) throw new Error('Ambiguous community installer')
    releases.push(release)
  }
  return releases.sort((a, b) => compare(b.version, a.version))[0] ?? null
}

interface Preferences {
  schemaVersion: 1
  ignored: string | null
  snoozed: string | null
  snoozeUntil: number
}
const defaults = (): Preferences => ({ schemaVersion: 1, ignored: null, snoozed: null, snoozeUntil: 0 })

/** Host dependencies are instance-owned so tests can control time, transport, and disk failures. */
export interface CommunityUpdateOptions {
  version: string | null
  platform: string
  arch: string
  preferencesPath: string
  fetch: typeof fetch
  publish: (state: CommunityUpdateState) => void
  openExternal: (url: string) => Promise<void>
  now?: () => number
  save?: (path: string, content: string) => Promise<void>
}

/** One desktop-owned notifier. Automatic work only fetches the small release manifest. */
export class CommunityUpdates {
  private snapshot: CommunityUpdateState
  private preferences = defaults()
  private readonly ready: Promise<void>
  private readonly now: () => number
  private pending: Promise<CommunityUpdateState> | undefined
  private saving: Promise<CommunityUpdateState> | undefined
  private controller: AbortController | undefined
  private timer: ReturnType<typeof setTimeout> | undefined
  private disposed = false
  private failures = 0
  private nextCheck: number

  constructor(private readonly options: CommunityUpdateOptions) {
    this.now = options.now ?? Date.now
    this.nextCheck = this.now() + 30000
    this.snapshot = { currentVersion: options.version ?? '', platform: options.platform, arch: options.arch,
      phase: 'idle', release: null, checkedAt: null, suppressed: null, preferenceError: false, openRequest: 0, revision: 0 }
    this.ready = this.loadPreferences()
    this.schedule()
  }

  /** Snapshot suppression is evaluated against the clock so expired snoozes never stay hidden. */
  get state(): CommunityUpdateState {
    const version = this.snapshot.release?.version
    const suppressed = version !== undefined && this.preferences.ignored === version ? 'ignored'
      : version !== undefined && this.preferences.snoozed === version && this.preferences.snoozeUntil > this.now() ? 'snoozed' : null
    return { ...this.snapshot, suppressed }
  }

  /** Read initial preferences before returning the first renderer snapshot. */
  async status(): Promise<CommunityUpdateState> { await this.ready; return this.state }

  private isDisposed(): boolean { return this.disposed }

  private emit(): void {
    if (this.disposed) return
    this.snapshot.revision++
    this.options.publish(this.state)
  }

  private async loadPreferences(): Promise<void> {
    try {
      const value: unknown = JSON.parse(await readFile(this.options.preferencesPath, 'utf8'))
      const version = (v: unknown): boolean => v === null || (typeof v === 'string' && valid(v) === v && /-community\.\d+$/.test(v))
      if (!object(value) || value.schemaVersion !== 1 || !version(value.ignored) || !version(value.snoozed)
        || typeof value.snoozeUntil !== 'number' || !Number.isSafeInteger(value.snoozeUntil) || value.snoozeUntil < 0) {
        throw new Error('Invalid reminder preferences')
      }
      this.preferences = { schemaVersion: 1, ignored: value.ignored as string | null,
        snoozed: value.snoozed as string | null, snoozeUntil: value.snoozeUntil }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') this.snapshot.preferenceError = true
    }
  }

  private schedule(): void {
    clearTimeout(this.timer)
    if (this.disposed) return
    this.timer = setTimeout(() => { void this.check() }, Math.max(0, this.nextCheck - this.now()))
    this.timer.unref()
  }

  /** Check at most once concurrently; automatic checks respect startup delay and retry backoff.
   * @param manual - True bypasses the next scheduled deadline without changing ignored preferences.
   * @returns Settled notification state; network failures never reject into background listeners.
   */
  check(manual = false): Promise<CommunityUpdateState> {
    if (this.disposed) return Promise.resolve(this.state)
    if (this.pending !== undefined) return this.pending
    if (!manual && this.now() < this.nextCheck) return this.status()
    this.pending = this.runCheck().finally(() => { this.pending = undefined; this.schedule() })
    return this.pending
  }

  private async runCheck(): Promise<CommunityUpdateState> {
    await this.ready
    if (this.isDisposed()) return this.state
    this.snapshot.phase = 'checking'; this.emit()
    const controller = new AbortController()
    this.controller = controller
    const timeout = setTimeout(() => { controller.abort() }, 20000)
    try {
      if (this.options.version === null) {
        this.snapshot.phase = 'unavailable'
      } else {
        const response = await this.options.fetch(FEED, { signal: controller.signal, cache: 'no-store',
          credentials: 'omit', redirect: 'error', headers: { Accept: 'application/json' } })
        if (!response.ok || response.body === null) throw new Error('Community release check failed')
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let length = 0
        try {
          for (;;) {
            const chunk = await reader.read()
            if (chunk.done) break
            length += chunk.value.length
            if (length > MAX_FEED_BYTES) throw new Error('Community release feed too large')
            chunks.push(chunk.value)
          }
        } finally {
          await reader.cancel().catch((_error: unknown) => { /* Abort can already have closed the body. */ })
          reader.releaseLock()
        }
        const feed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const release = selectCommunityRelease(feed, this.options.platform, this.options.arch)
        if (this.isDisposed()) return this.state
        if (controller.signal.aborted) throw new Error('Community release check timed out')
        this.snapshot.release = release !== null && compare(release.version, this.options.version) > 0 ? release : null
        this.snapshot.phase = release === null ? 'unavailable' : this.snapshot.release === null ? 'current' : 'available'
      }
      this.snapshot.checkedAt = this.now()
      this.failures = 0
      this.nextCheck = this.now() + INTERVAL
    } catch (_error) {
      if (this.isDisposed()) return this.state
      this.snapshot.phase = 'error'
      this.nextCheck = this.now() + Math.min(INTERVAL, 5 * 60000 * 2 ** Math.min(this.failures++, 7))
    } finally { clearTimeout(timeout); this.controller = undefined }
    this.emit()
    return this.state
  }

  /** Native menu opens the same renderer dialog without interrupting a running task. */
  open(): void { if (!this.disposed) { this.snapshot.openRequest++; this.emit(); void this.check(true) } }

  /** Execute an explicit user action. Download opens a browser; it never installs in-process.
   * @param action - Validated IPC operation.
   * @param version - Required for release-specific actions; omitted for check.
   * @returns State after the operation, or rejects when the selection is stale or saving fails.
   */
  async act(action: CommunityUpdateAction, version?: string): Promise<CommunityUpdateState> {
    await this.ready
    if (this.disposed) throw new Error('Community updates closed')
    if (action === 'check') return this.check(true)
    const release = this.snapshot.release
    if (release === null || release.version !== version) throw new Error('Community release selection changed')
    if (action === 'download' || action === 'notes') {
      await this.options.openExternal(action === 'download' ? release.url : release.notesUrl)
      return this.state
    }
    if (this.saving !== undefined) throw new Error('Reminder save already in progress')
    const next: Preferences = action === 'ignore' ? { ...this.preferences, ignored: release.version }
      : { ...this.preferences, ignored: this.preferences.ignored === release.version ? null : this.preferences.ignored,
        snoozed: release.version, snoozeUntil: this.now() + SNOOZE }
    this.saving = (async () => {
      try {
        const content = JSON.stringify(next) + '\n'
        if (this.options.save !== undefined) await this.options.save(this.options.preferencesPath, content)
        else await writeFileAtomic(this.options.preferencesPath, content, { mode: 0o600 })
        this.preferences = next; this.snapshot.preferenceError = false
        this.emit()
        return this.state
      } catch (error) { this.snapshot.preferenceError = true; this.emit(); throw error }
    })().finally(() => { this.saving = undefined })
    return this.saving
  }

  /** Abort network work, stop timers, and await all owned disk and transport operations. */
  async dispose(): Promise<void> {
    this.disposed = true
    clearTimeout(this.timer)
    this.controller?.abort()
    await Promise.allSettled([this.ready, this.pending, this.saving])
  }
}
