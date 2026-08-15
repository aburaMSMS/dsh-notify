/**
 * dsh-notify — browser half (runs inside the dsh web GUI).
 *
 * Watches the session list for situations that need the user and shows
 * in-page toasts (bottom-right stack; clicking a toast opens the owning
 * session). The OS notification layer is owned by the Host half (Windows
 * native toasts + ntfy); the browser Notification API was removed from this
 * plugin — it needs per-site permissions and is redundant with the native
 * channel.
 *
 * One extra surface:
 * - the `settings.section` entry ("通知") renders the plugin's settings
 *   form inside the DSH settings panel; edits travel through the plugin's
 *   own loopback bridge (`/api/dsh-notify/settings`) to the same durable
 *   namespace the Host resolves its live config from, so every change
 *   applies immediately on both halves;
 * - the toast gates/messages re-read the live config on every event, so
 *   settings toggles take effect without a reload.
 *
 * The 插件 → 插件配置 tab is intentionally not claimed: the settings entry
 * lives only in the outer settings list.
 *
 * Failure policy: mounting problems are logged, never thrown — an external
 * plugin must not take the GUI down.
 *
 * Typing note: the client reads `sessions` as a plain service value. In a
 * single-program build the host `@deepseek-ai/dsh-session` Context merge
 * (`sessions: SessionStore`) and the client runtime merge
 * (`sessions: ISessions`) collide on the same key, so feature code must not
 * consume `ctx.sessions` through the merged Context type.
 */
import type { Context } from '@deepseek-ai/cordis'
import { createElement } from 'react'
import type { ISessions, SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { NotifyConfig, PartialNotifyConfig } from '../config.ts'
import { withDefaults } from '../config.ts'
import {
  applyCustomTitle, approvalMessage, completionMessage, planReviewMessage, questionMessage, startMessage,
  type NotifyMessage,
} from '../messages.ts'
import { NotifySettingsClient } from './settings-client.ts'
import { NotifySettingsSection } from './settings-section.tsx'
import { mountToasts, toastStore } from './toast.tsx'
import { mountPresence } from './presence.ts'
import { mountWatcher, type NotifyEvent } from './watcher.ts'

/** Required services: the sessions store and the slot registry must be up before the plugin mounts. */
export const inject = ['sessions', 'slots']

/** Monotonic toast id source. */
let toastId = 0
/** Blocking-interaction toasts stay visible this long (the user may be away). */
const BLOCKING_TOAST_MS = 5 * 60_000

/**
 * Mount the notification watcher, toast stack, and settings section.
 * @param ctx - client root context (sessions service).
 * @param config - row config (defaults applied when absent).
 */
export function apply(ctx: Context, config: PartialNotifyConfig = {}): void {
  const cfg = withDefaults(config)
  const sessions: ISessions | undefined = (ctx as unknown as { sessions?: ISessions }).sessions

  // --- settings client: the plugin's own loopback bridge (the rc.6 web
  // settings boundary allowlists namespaces, so settingsScope cannot reach
  // this plugin's section — see settings-route.ts). ---
  const settingsClient = new NotifySettingsClient()
  void settingsClient.load()

  /** Live config: settings-resolved value when ready, composition entry otherwise. */
  const getConfig = (): NotifyConfig => {
    const snapshot = settingsClient.getSnapshot()
    if (snapshot.status === 'ready' && snapshot.value !== undefined) return snapshot.value
    return cfg
  }

  const disposers: Array<() => void> = []
  try {
    // The settings entry mounts even while `enabled` is false — otherwise a
    // disabled plugin would disappear from the settings panel and the user
    // could never turn it back on from the UI.
    disposers.push(ctx.slots.inject('settings.section', () => ctx.slots.register(
      { name: 'settings.section', id: 'dsh-notify', order: 200, label: '通知' },
      () => createElement(NotifySettingsSection, { settings: settingsClient }),
    )))
    // Tell the Host whether the DSH page is active so it can route desktop
    // toasts away while the in-page stack is visible.
    disposers.push(mountPresence())
    if (sessions !== undefined) {
      const openSession = (sessionId: string): void => {
        try {
          sessions.open(sessionId as unknown as SessionId)
        } catch (error) {
          console.warn('[dsh-notify] open session failed:', error)
        }
      }
      // Watcher and toast stack stay mounted while disabled too: the event
      // dispatch re-reads the live config, so enabling from the settings
      // panel takes effect without a page reload.
      disposers.push(mountWatcher(sessions, getConfig, (event) => { handleEvent(sessions, getConfig, event, openSession) }))
      disposers.push(mountToasts(openSession))
    } else {
      console.warn('[dsh-notify] sessions service is absent; notifications are disabled for this page')
    }
  } catch (error) {
    // DOM/mount failures degrade the notifications, never the GUI.
    console.warn('[dsh-notify] mount failed:', error)
  }
  ctx.effect(() => () => {
    for (const dispose of disposers.splice(0)) dispose()
  }, 'dsh-notify: mounts')
}

/** Dispatch one watcher event to the in-page toast stack. */
function handleEvent(sessions: ISessions, getConfig: () => NotifyConfig, event: NotifyEvent, openSession: (sessionId: string) => void): void {
  const cfg = getConfig()
  if (!cfg.enabled) return
  if (event.kind === 'completion' && !cfg.onCompletion) return
  if (event.kind === 'start' && !cfg.onStart) return
  if (event.kind === 'approval' && !cfg.onApproval) return
  if ((event.kind === 'question' || event.kind === 'planReview') && !cfg.onQuestion) return

  console.info(`[dsh-notify] event: ${event.kind} session=${event.sessionId}`)

  const message = applyCustomTitle(messageFor(sessions, cfg, event), cfg.customTitle)
  // Blocking interactions (approval/question/plan review) stay visible for
  // five minutes — the user may be away; completions dismiss after 8 s.
  const blocking = event.kind === 'approval' || event.kind === 'question' || event.kind === 'planReview'
  const durationMs = blocking ? BLOCKING_TOAST_MS : undefined

  // In-page toast only while the page is actually visible; hidden pages are
  // covered by the host's OS-layer channels (and an invisible stack would
  // backlog).
  if (document.visibilityState === 'visible') {
    toastStore.push({
      id: ++toastId,
      title: message.title,
      body: message.body,
      sessionId: event.sessionId,
      durationMs,
    })
  }
}

/** Build the notification copy for one event (richer approval detail when available). */
function messageFor(sessions: ISessions, cfg: NotifyConfig, event: NotifyEvent): NotifyMessage {
  if (event.kind === 'completion') return completionMessage(cfg.language, event.label)
  if (event.kind === 'start') return startMessage(cfg.language, event.label)
  if (event.kind === 'question') return questionMessage(cfg.language, event.label)
  if (event.kind === 'planReview') return planReviewMessage(cfg.language, event.label)
  return approvalMessage(cfg.language, event.label, ...approvalDetail(sessions, event.sessionId))
}

/** Read the pending approval's tool name and reason off the session snapshot. */
function approvalDetail(sessions: ISessions, sessionId: string): [toolName?: string, reason?: string] {
  try {
    const binding = sessions.binding(sessionId as unknown as SessionId)
    const pending = binding?.session.getSnapshot().pending ?? []
    const approval = pending.find(item => item.kind === 'approval')
    if (approval !== undefined && approval.kind === 'approval') {
      return [approval.payload.toolName, approval.payload.reason]
    }
  } catch (error) {
    // Snapshot read races session teardown; the generic copy still works.
    console.warn('[dsh-notify] approval detail lookup failed:', error)
  }
  return []
}
