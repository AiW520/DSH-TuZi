/** Community notifications only; this API cannot download, install, or restart the application. */
export const COMMUNITY_UPDATE_IPC = {
  status: 'community-updates:status',
  action: 'community-updates:action',
  changed: 'community-updates:changed',
} as const

/** User-selected operations; versioned actions reject stale selections. */
export type CommunityUpdateAction = 'check' | 'later' | 'ignore' | 'download' | 'notes' | 'acknowledge'

/** A qualified installer matching this running application's OS and architecture. */
export interface CommunityRelease {
  version: string
  url: string
  notesUrl: string
  notes: string
  bytes: number
  sha256: string
  signing: 'unsigned-test' | 'signed'
}

/** Complete renderer snapshot, including reminder suppression and local persistence failures. */
export interface CommunityUpdateState {
  currentVersion: string
  platform: string
  arch: string
  phase: 'idle' | 'checking' | 'available' | 'current' | 'unavailable' | 'error'
  release: CommunityRelease | null
  checkedAt: number | null
  suppressed: 'ignored' | 'snoozed' | null
  preferenceError: boolean
  openRequest: number
  revision: number
}

/** Optional preload bridge, present only in the community desktop's trusted main frame. */
export interface CommunityUpdateApi {
  status(): Promise<CommunityUpdateState>
  action(action: CommunityUpdateAction, version?: string, openRequest?: number): Promise<CommunityUpdateState>
  subscribe(listener: (state: CommunityUpdateState) => void): () => void
}
