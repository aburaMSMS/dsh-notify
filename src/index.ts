/**
 * dsh-notify — host half.
 *
 * Listens to the host event surface for the three "the human must act next"
 * situations and pushes notifications to the configured channels:
 *
 * - `agent/status` idle      → the session's turn finished (任务执行完毕);
 * - `approval/request`       → a tool requested permission (需要权限许可);
 * - `session/event` tool/call `ask_user_question` → the agent needs an
 *   answer (需要用户回答).
 *
 * Channels: ntfy.sh push and Windows native toasts (WinRT direct-send under
 * a Start-Menu-shortcut identity). The plugin doubles as the `ctx.notify`
 * service so other plugins can publish notifications through the same
 * channels.
 *
 * Configuration is live: `installSettingsSection` registers the
 * `dsh-notify` settings namespace, so the DSH settings page edits the
 * effective config at runtime (composition config remains the base layer).
 * Every event handler re-reads the current value, so toggles apply without
 * a restart. All event listeners register through `ctx.on` in the
 * constructor and are therefore bound to this plugin's fiber.
 */
import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type { Agent, AgentRegistry, AgentStatus } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-user-approval'
import type { SessionTitleService } from '@deepseek-ai/dsh-session-title'
import type {} from '@deepseek-ai/dsh-session-title'
import type { NotifyConfig, NtfyPriority, PartialNotifyConfig } from './config.ts'
import { NOTIFY_DEFAULTS, withDefaults } from './config.ts'
import { desktopAumidHelperPath, desktopIconPath, desktopLogoPath, ensureDesktopAppId, sendDesktopToast } from './desktop.ts'
import {
  applyCustomTitle, approvalMessage, completionMessage, questionMessage, startMessage,
  type NotifyMessage,
} from './messages.ts'
import { publishNtfy } from './ntfy.ts'
import { NotifyConfigSchema } from './schema.ts'
import { makeSettingsRoutes } from './settings-route.ts'

/** Stable cordis plugin name (row id `dsh-notify`). */
export const name = 'dsh-notify'

/** Settings namespace surfacing this plugin in the DSH settings page. */
export const NOTIFY_SETTINGS_NAMESPACE = settingsNamespace('dsh-notify')

/** Tool name whose invocation means "the user will be asked a question". */
const ASK_USER_TOOL = 'ask_user_question'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Notification service provided by the dsh-notify plugin. */
    notify: NotifyService
  }
}

/** Input for {@link NotifyService.send} (service consumers). */
export interface NotifyInput {
  /** Short headline. */
  title: string
  /** Plain-text body. */
  body: string
  /** Comma-separated emoji tags (ntfy header). */
  tags?: string
  /** ntfy priority override. */
  priority?: NtfyPriority
}

/**
 * Host notification service. Listens to the session/approval/question event
 * surface and publishes to ntfy + Windows native toasts; `send()` is the
 * public entry for other plugins. Configuration resolves live from the
 * settings namespace (falling back to the composition entry).
 */
export class NotifyService extends Service {
  /** Loader-facing config schema (defaults mirror `NOTIFY_DEFAULTS`). */
  static Config = NotifyConfigSchema

  /** Live config reader: settings-resolved when the namespace is attached, composition entry otherwise. */
  private current: () => NotifyConfig
  /** Whether the toast identity shortcut is registered for the current config. */
  private desktopAvailable = false
  /** Last registered desktop identity signature (avoids re-registering on every settings change). */
  private desktopSignature = ''

  constructor(ctx: Context, config: PartialNotifyConfig = {}) {
    super(ctx, 'notify')
    this.current = () => withDefaults(config ?? {})
    // Listeners stay mounted for the fiber lifetime; each event re-reads the
    // live config, so settings toggles apply immediately.
    this.ctx.on('agent/status', ({ agent, status }) => { this.onAgentStatus(agent, status) })
    this.ctx.on('approval/request', (req, next) => {
      if (this.cfg().onApproval) {
        this.push(approvalMessage(this.cfg().language, this.labelOf(req.agent.session), req.toolName, req.reason))
      }
      // Never short-circuit the approval waterfall: this plugin only observes.
      return next()
    })
    this.ctx.on('session/event', (session, event) => { this.onSessionEvent(session, event) })

    // Live settings: the section registers once the settings service exists
    // (a no-op in headless compositions without one). setSource swaps the
    // reader on attach/detach; onChange re-syncs the channels on user edits.
    installSettingsSection(this.ctx, NOTIFY_SETTINGS_NAMESPACE, NotifyConfigSchema, withDefaults(config ?? {}), {
      setSource: (source) => {
        this.current = source
        void this.syncChannels().catch((error: unknown) => {
          this.ctx.logger.warn(`dsh-notify: settings source swap failed: ${String(error)}`)
        })
      },
      onChange: () => {
        void this.syncChannels().catch((error: unknown) => {
          this.ctx.logger.warn(`dsh-notify: applying settings failed: ${String(error)}`)
        })
      },
    })

    // Settings bridge routes: the rc.6 web settings boundary serves only a
    // hard-coded namespace allowlist, so the settings page talks to the
    // plugin directly instead (see settings-route.ts). Lazy inject (the
    // same pattern installSettingsSection uses): this constructor may run
    // before the webserver service exists, and a direct ctx.get here would
    // read undefined and silently skip the routes.
    this.ctx.inject(['webServer'], (sctx) => {
      const routes = makeSettingsRoutes({
        getConfig: () => this.cfg(),
        settings: () => this.ctx.get('settings') as SettingsProvider | undefined,
        namespace: NOTIFY_SETTINGS_NAMESPACE,
      })
      sctx.effect(() => {
        const disposers = routes.map(route => sctx.webServer.register(route))
        return () => {
          for (const dispose of disposers) dispose()
        }
      }, 'dsh-notify: settings routes')
    })
  }

  /** Startup validation + initial channel build; fails loud on a bad ntfy config. */
  async [Service.init](): Promise<void> {
    const cfg = this.cfg()
    if (!cfg.enabled) {
      this.ctx.logger.info('dsh-notify: disabled by config')
      return
    }
    if (cfg.ntfy.enabled && cfg.ntfy.topic.trim() === '') {
      throw new Error('dsh-notify: ntfy.enabled is true but ntfy.topic is empty — set a topic (and subscribe to it) or disable ntfy')
    }
    await this.syncChannels()
  }

  /**
   * Publish one notification through the host channels (ntfy + native toast
   * when enabled). Never throws: channel failures are logged and dropped.
   * @param input - title/body plus optional tag and priority overrides.
   */
  send(input: NotifyInput): void {
    this.push({ title: input.title, body: input.body, tags: input.tags ?? 'bell' }, input.priority)
  }

  /** Current effective config (settings-resolved or composition fallback). */
  private cfg(): NotifyConfig {
    try {
      return this.current()
    } catch {
      return NOTIFY_DEFAULTS
    }
  }

  /** Rebuild host channels from the live config (desktop identity registration). */
  private async syncChannels(): Promise<void> {
    const cfg = this.cfg()
    if (!cfg.enabled || !cfg.desktopToast.enabled) {
      this.desktopAvailable = false
      this.desktopSignature = ''
      return
    }
    const desktop = cfg.desktopToast
    // The identity shortcut must reflect appName + icon; the signature skips
    // re-registration when nothing relevant changed.
    const signature = `${desktop.appId}\u0000${desktop.appName}\u0000${this.shortcutIconPath(cfg)}`
    if (this.desktopAvailable && this.desktopSignature === signature) return
    await ensureDesktopAppId(desktop, this.shortcutIconPath(cfg), desktopAumidHelperPath())
    this.desktopAvailable = true
    this.desktopSignature = signature
    this.ctx.logger.info(`dsh-notify: windows native toasts active (app "${desktop.appName}")`)
  }

  /** Shortcut icon: the user's .ico when configured, the bundled icon otherwise. */
  private shortcutIconPath(cfg: NotifyConfig): string {
    const custom = cfg.desktopToast.logoPath.trim()
    return custom.toLowerCase().endsWith('.ico') ? custom : desktopIconPath()
  }

  /** Toast body logo: the user's image when configured (PNG preferred), the bundled PNG otherwise. */
  private toastLogoPath(cfg: NotifyConfig): string {
    const custom = cfg.desktopToast.logoPath.trim()
    return custom === '' ? desktopLogoPath() : custom
  }

  private onAgentStatus(agent: Agent, status: AgentStatus): void {
    const cfg = this.cfg()
    if (!cfg.enabled) return
    if (status === 'idle') {
      if (!cfg.onCompletion || !this.isRoot(agent)) return
      this.push(applyCustomTitle(completionMessage(cfg.language, this.labelOf(agent.session)), cfg.customTitle))
    } else {
      if (!cfg.onStart || !this.isRoot(agent)) return
      this.push(applyCustomTitle(startMessage(cfg.language, this.labelOf(agent.session)), cfg.customTitle))
    }
  }

  private onSessionEvent(session: Session, event: SessionEvent): void {
    const cfg = this.cfg()
    if (!cfg.enabled || !cfg.onQuestion) return
    if (event.type !== 'tool/call' || event.data.name !== ASK_USER_TOOL) return
    // Only root sessions can actually reach a human answerer.
    if (!this.isRootById(session.id)) return
    this.push(applyCustomTitle(questionMessage(cfg.language, this.labelOf(session)), cfg.customTitle))
  }

  /** Whether an agent is a root (not owned by another agent); absent registry → notify anyway. */
  private isRoot(agent: Agent): boolean {
    const registry: AgentRegistry | undefined = this.ctx.get('agents')
    if (registry === undefined) return true
    try {
      return registry.roots().includes(agent)
    } catch (error) {
      this.ctx.logger.warn(`dsh-notify: agents registry check failed (${String(error)}); notifying anyway`)
      return true
    }
  }

  /** Root check by session id (agent id === session id). */
  private isRootById(sessionId: Session['id']): boolean {
    const registry: AgentRegistry | undefined = this.ctx.get('agents')
    if (registry === undefined) return true
    try {
      const agent = registry.get(sessionId)
      return agent === undefined ? true : registry.roots().includes(agent)
    } catch (error) {
      this.ctx.logger.warn(`dsh-notify: agents registry check failed (${String(error)}); notifying anyway`)
      return true
    }
  }

  /** Human-facing session label: durable title → workspace basename → session id. */
  private labelOf(session: Session): string {
    const titles: SessionTitleService | undefined = this.ctx.get('sessionTitle')
    const title = titles?.get(session)?.title
    if (title !== undefined && title.trim() !== '') return title
    if (session.header.cwd !== undefined) {
      const base = session.header.cwd.replace(/[/\\]+$/u, '').split(/[/\\]/u).pop()
      if (base !== undefined && base !== '') return base
    }
    return String(session.id)
  }

  private push(message: NotifyMessage, priority?: NtfyPriority): void {
    try {
      this.ctx.logger.info(`dsh-notify: ${message.title} — ${message.body}`)
    } catch {
      // Logging must never break the event chain.
    }
    const cfg = this.cfg()
    const ntfy = cfg.ntfy
    if (ntfy.enabled && ntfy.topic.trim() !== '') {
      void publishNtfy({ ...ntfy, priority: priority ?? ntfy.priority }, message).catch((error: unknown) => {
        this.ctx.logger.warn(`dsh-notify: ntfy publish failed: ${String(error)}`)
      })
    }
    const desktop = cfg.desktopToast
    if (desktop.enabled && this.desktopAvailable) {
      void sendDesktopToast(desktop, message, this.toastLogoPath(cfg)).catch((error: unknown) => {
        this.ctx.logger.warn(`dsh-notify: desktop toast failed: ${String(error)}`)
      })
    }
  }
}

export default NotifyService
