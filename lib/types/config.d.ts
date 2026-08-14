/**
 * Shared notification configuration: types and defaults used by BOTH halves
 * (the host ntfy pusher / Windows desktop toaster and the browser
 * watcher/toasts). This module carries no runtime imports so the client
 * bundle stays pure.
 *
 * @module dsh-notify/config
 */
/** Notification copy language. */
export type NotifyLanguage = 'zh' | 'en';
/** ntfy message priority levels. */
export type NtfyPriority = 'min' | 'low' | 'default' | 'high' | 'max';
/** ntfy.sh push channel settings (see https://docs.ntfy.sh). */
export interface NtfyConfig {
    /** Push notifications to an ntfy server when a situation fires. */
    enabled: boolean;
    /** ntfy server base URL (https://ntfy.sh or a self-hosted instance). */
    server: string;
    /** Topic to publish to; subscribers on the same topic receive the push. Required when enabled. */
    topic: string;
    /** Optional access token for protected topics. */
    token: string;
    /** Message priority. */
    priority: NtfyPriority;
    /** Comma-separated emoji tags shown on the notification. */
    tags: string;
    /** Optional URL opened when the user clicks the notification. */
    clickUrl: string;
}
/** PowerShell executable choice for the Windows desktop toast channel. */
export type DesktopShell = 'pwsh' | 'powershell';
/** Windows native toast settings (host-raised, no browser permission involved). */
export interface DesktopToastConfig {
    /** Raise Windows native toasts from the host process. */
    enabled: boolean;
    /** PowerShell executable; 'powershell' (Windows PowerShell 5.1) is required for the WinRT toast path. */
    shell: DesktopShell;
    /** How long to wait for the toast process before killing it. */
    timeoutMs: number;
    /** AppUserModelID registered on the identity shortcut (stable reference). */
    appId: string;
    /** Display name of the toast identity (also the Start-Menu shortcut name). */
    appName: string;
    /** Custom toast icon: local PNG/ICO absolute path; empty = bundled DeepSeek whale mark. */
    logoPath: string;
    /** URL opened when a toast is clicked (empty = default target). */
    openUrl: string;
}
/** Full plugin config; every field has a schema default. */
export interface NotifyConfig {
    /** Master switch for both halves. */
    enabled: boolean;
    /** Copy language of the notifications. */
    language: NotifyLanguage;
    /** Custom notification title overriding the built-in per-situation titles (empty = built-in). */
    customTitle: string;
    /** Notify when a session's turn starts running. */
    onStart: boolean;
    /** Notify when a session's turn finishes (idle again). */
    onCompletion: boolean;
    /** Notify when a tool requests permission. */
    onApproval: boolean;
    /** Notify when the agent asks the user a question (ask_user_question). */
    onQuestion: boolean;
    ntfy: NtfyConfig;
    desktopToast: DesktopToastConfig;
}
/** Schema defaults, spelled once (the schemastery schema mirrors these). */
export declare const NOTIFY_DEFAULTS: NotifyConfig;
/** Deep-partial config as accepted from the loader or tests. */
export type PartialNotifyConfig = Partial<Omit<NotifyConfig, 'ntfy' | 'desktopToast'>> & {
    ntfy?: Partial<NtfyConfig>;
    desktopToast?: Partial<DesktopToastConfig>;
};
/**
 * Merge a (possibly partial, possibly undefined) loader-provided config over
 * the defaults. Used by both halves instead of trusting the loader to have
 * applied schema defaults.
 * @param config - the row config the loader passed to apply().
 * @returns a fully populated config.
 */
export declare function withDefaults(config: PartialNotifyConfig | undefined | null): NotifyConfig;
