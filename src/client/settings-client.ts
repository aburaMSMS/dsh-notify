/**
 * Browser-side settings client: a fetch-based stand-in for the settings
 * namespace transport. rc.6's web settings boundary serves only a
 * hard-coded namespace allowlist (see settings-route.ts), so the plugin
 * reads and writes its configuration through its own loopback API instead
 * of `ctx.settingsScope`.
 *
 * The public face (subscribe/getSnapshot/set) matches the settings-scope
 * shape so the settings form needs no knowledge of the transport.
 *
 * @module dsh-notify/client/settings-client
 */

import type { NotifyConfig } from '../config.ts'
import { SETTINGS_API_PATH } from '../settings-route.ts'

/** Sync snapshot of the plugin's settings, mirroring the scope shape. */
export interface NotifySettingsSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  value: NotifyConfig | undefined
}

/** Minimal face the settings form consumes. */
export interface NotifySettingsFace {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => NotifySettingsSnapshot
  set: (field: string, value: unknown) => Promise<void>
}

/** Fetch-based settings client (one per page load). */
export class NotifySettingsClient implements NotifySettingsFace {
  private snapshot: NotifySettingsSnapshot = { status: 'loading', value: undefined }
  private readonly listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  readonly getSnapshot = (): NotifySettingsSnapshot => this.snapshot

  /** Pull the live resolved config from the host bridge. */
  async load(): Promise<void> {
    try {
      const response = await fetch(SETTINGS_API_PATH, { cache: 'no-store' })
      if (!response.ok) {
        this.accept({ status: 'unavailable', value: undefined })
        return
      }
      const body = await response.json() as { ok?: boolean; value?: unknown }
      if (body.ok !== true || typeof body.value !== 'object' || body.value === null) {
        this.accept({ status: 'unavailable', value: undefined })
        return
      }
      this.accept({ status: 'ready', value: body.value as NotifyConfig })
    } catch (error) {
      console.warn('[dsh-notify] settings load failed:', error)
      this.accept({ status: 'unavailable', value: undefined })
    }
  }

  /** Apply one field edit through the host bridge, then refresh. */
  async set(field: string, value: unknown): Promise<void> {
    try {
      const response = await fetch(SETTINGS_API_PATH, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ field, value }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${response.status}`)
      }
    } finally {
      await this.load()
    }
  }

  private accept(snapshot: NotifySettingsSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }
}
