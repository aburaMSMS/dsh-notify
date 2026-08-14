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
 * Two extra surfaces:
 * - the `settings.section` entry ("通知") renders the plugin's settings
 *   form inside the DSH settings panel; edits travel through
 *   `ctx.settingsScope` to the same durable namespace the Host resolves its
 *   live config from, so every change applies immediately on both halves;
 * - the toast gates/messages re-read the live config on every event, so
 *   settings toggles take effect without a reload.
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
import type { Context } from '@deepseek-ai/cordis';
import type { PartialNotifyConfig } from '../config.ts';
/** Required services: the sessions store and the slot registry must be up before the plugin mounts. */
export declare const inject: string[];
/**
 * Mount the notification watcher, toast stack, and settings section.
 * @param ctx - client root context (sessions service).
 * @param config - row config (defaults applied when absent).
 */
export declare function apply(ctx: Context, config?: PartialNotifyConfig): void;
