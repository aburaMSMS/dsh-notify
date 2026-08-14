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
import { Service } from '@deepseek-ai/cordis';
import type { Context } from '@deepseek-ai/cordis';
import type { NotifyConfig, NtfyPriority, PartialNotifyConfig } from './config.ts';
/** Stable cordis plugin name (row id `dsh-notify`). */
export declare const name = "dsh-notify";
/** Settings namespace surfacing this plugin in the DSH settings page. */
export declare const NOTIFY_SETTINGS_NAMESPACE: import("@deepseek-ai/dsh-settings").SettingsNamespace;
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Notification service provided by the dsh-notify plugin. */
        notify: NotifyService;
    }
}
/** Input for {@link NotifyService.send} (service consumers). */
export interface NotifyInput {
    /** Short headline. */
    title: string;
    /** Plain-text body. */
    body: string;
    /** Comma-separated emoji tags (ntfy header). */
    tags?: string;
    /** ntfy priority override. */
    priority?: NtfyPriority;
}
/**
 * Host notification service. Listens to the session/approval/question event
 * surface and publishes to ntfy + Windows native toasts; `send()` is the
 * public entry for other plugins. Configuration resolves live from the
 * settings namespace (falling back to the composition entry).
 */
export declare class NotifyService extends Service {
    /** Loader-facing config schema (defaults mirror `NOTIFY_DEFAULTS`). */
    static Config: import("schemastery")<NotifyConfig>;
    /** Live config reader: settings-resolved when the namespace is attached, composition entry otherwise. */
    private current;
    /** Whether the toast identity shortcut is registered for the current config. */
    private desktopAvailable;
    /** Last registered desktop identity signature (avoids re-registering on every settings change). */
    private desktopSignature;
    constructor(ctx: Context, config?: PartialNotifyConfig);
    /** Startup validation + initial channel build; fails loud on a bad ntfy config. */
    [Service.init](): Promise<void>;
    /**
     * Publish one notification through the host channels (ntfy + native toast
     * when enabled). Never throws: channel failures are logged and dropped.
     * @param input - title/body plus optional tag and priority overrides.
     */
    send(input: NotifyInput): void;
    /** Current effective config (settings-resolved or composition fallback). */
    private cfg;
    /** Rebuild host channels from the live config (desktop identity registration). */
    private syncChannels;
    /** Shortcut icon: the user's .ico when configured, the bundled icon otherwise. */
    private shortcutIconPath;
    /** Toast body logo: the user's image when configured (PNG preferred), the bundled PNG otherwise. */
    private toastLogoPath;
    private onAgentStatus;
    private onSessionEvent;
    /** Whether an agent is a root (not owned by another agent); absent registry → notify anyway. */
    private isRoot;
    /** Root check by session id (agent id === session id). */
    private isRootById;
    /** Human-facing session label: durable title → workspace basename → session id. */
    private labelOf;
    private push;
}
export default NotifyService;
