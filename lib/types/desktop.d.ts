/**
 * Windows native desktop toasts: the host process raises OS-level toasts
 * directly through Windows PowerShell (5.1) + the WinRT toast APIs, using an
 * explicit AppUserModelID registered via a Start-Menu shortcut — bypassing
 * the browser notification permission entirely (no user gesture, no prompt,
 * works even with the DSH page closed) and with a custom app name + icon.
 *
 * Why not BurntToast: its ToastNotificationManagerCompat discovers the toast
 * identity by scanning Start-Menu shortcuts through shell APIs that fail on
 * current Windows builds, so toasts always fall back to the PowerShell
 * identity. `CreateToastNotifier(appId)` with an explicit AUMID sidesteps
 * the discovery entirely and shows the shortcut's own name and icon.
 *
 * Design notes:
 * - Scripts travel base64-encoded (`-EncodedCommand`, UTF-16LE) so text
 *   never needs shell quoting.
 * - Toast XML text is XML-escaped; the PowerShell literal is single-quoted
 *   (and the escaped XML never contains a raw single quote).
 * - The identity shortcut is created in TEMP, stamped with the AUMID by the
 *   packaged helper exe (IShellLink → IPropertyStore; in-place writes fail
 *   with STG_E_ACCESSDENIED because Explorer holds the Start-Menu file),
 *   then moved into the Start Menu — and verified via Get-StartApps on
 *   re-runs.
 * - Spawning takes injectable process functions so tests can drive
 *   success/failure without a real shell.
 *
 * @module dsh-notify/desktop
 */
import type { DesktopToastConfig } from './config.ts';
import type { NotifyMessage } from './messages.ts';
/** Escape a string as a PowerShell single-quoted literal ('' doubles a quote). */
export declare function psQuote(value: string): string;
/** Escape text for inclusion in toast XML character data. */
export declare function xmlEscape(value: string): string;
/**
 * Build a file:// URI from an absolute Windows path. The encoding is
 * platform-independent (the host may run tests/builds outside Windows) and
 * encodes `#`, `?`, `%`, spaces, and unicode per segment while keeping the
 * drive letter and UNC server/share syntax.
 */
export declare function fileUri(path: string): string;
/** Whether the desktop toast channel can run on this platform (WinRT/PowerShell path is Windows-only). */
export declare function desktopToastSupported(platform?: NodeJS.Platform): boolean;
/** Signature of the toast identity: every shortcut-affecting setting must be part of it. */
export declare function desktopIdentitySignature(config: DesktopToastConfig, iconPath: string): string;
/**
 * Build the WinRT toast XML for one notification.
 * @param title - toast headline.
 * @param body - toast body.
 * @param logoPath - absolute path of the PNG shown inside the toast
 *   (appLogoOverride; toast rendering does not support .ico).
 * @returns adaptive toast XML.
 */
export declare function winToastXml(title: string, body: string, logoPath: string): string;
/**
 * Build the script that raises one Windows toast through the WinRT APIs with
 * the plugin's explicit AppUserModelID. Runs on Windows PowerShell 5.1 (the
 * WinRT type projection is reliable there; pwsh 7 rejects the types in
 * non-interactive sessions).
 * @param config - desktop toast settings (appId).
 * @param message - the notification.
 * @param logoPath - absolute path of the PNG shown inside the toast.
 * @returns PowerShell script text.
 */
export declare function winToastScript(config: DesktopToastConfig, message: NotifyMessage, logoPath: string): string;
/**
 * Build the idempotent script that registers the plugin's toast identity: a
 * Start-Menu shortcut carrying an explicit AppUserModelID (the identity
 * Windows shows as the toast header name + icon). BurntToast's
 * ToastNotificationManagerCompat discovers Start-Menu shortcut AUMIDs
 * automatically, so a plain `New-BurntToastNotification` call shows this
 * identity with no further wiring.
 *
 * The AUMID write happens on a TEMP copy through the packaged helper exe
 * (IShellLink → IPropertyStore): Explorer holds the Start-Menu shortcut's
 * property store open, so in-place writes fail with STG_E_ACCESSDENIED on
 * current Windows. The finished temp copy then replaces the Start-Menu
 * entry. The shortcut target is a browser-open command so clicking a toast
 * opens the DSH GUI instead of a console window.
 * @param config - desktop toast settings (appId/appName/openUrl).
 * @param iconPath - absolute path of the .ico shown on the toast.
 * @param helperPath - absolute path of the AUMID writer exe.
 * @returns PowerShell script text (safe to re-run; verifies via Get-StartApps).
 */
export declare function ensureAppIdScript(config: DesktopToastConfig, iconPath: string, helperPath: string): string;
/** Absolute path of the packaged AUMID writer exe (lib/ → package root/assets). */
export declare function desktopAumidHelperPath(): string;
/** Encode a script for `powershell -EncodedCommand` (requires UTF-16LE base64). */
export declare function encodedPowerShellCommand(script: string): string;
/** Absolute path of the packaged shortcut icon (lib/ → package root/assets; .ico). */
export declare function desktopIconPath(): string;
/** Absolute path of the packaged toast logo image (lib/ → package root/assets; PNG). */
export declare function desktopLogoPath(): string;
/** Minimal child-process face the spawn wrapper needs (test double friendly). */
export interface ToastChild {
    on(event: 'error', listener: (error: Error) => void): ToastChild;
    on(event: 'close', listener: (code: number | null) => void): ToastChild;
    kill(): void;
}
/** Spawn signature compatible with `node:child_process.spawn`. */
export type ToastSpawn = (command: string, args: readonly string[], options: object) => ToastChild;
/**
 * Raise one Windows toast. Resolves when the toast process exits cleanly;
 * rejects on spawn errors, non-zero exit, or timeout.
 * @param config - desktop toast settings (shell + timeout).
 * @param message - the notification.
 * @param logoPath - absolute path of the PNG shown inside the toast.
 * @param spawnImpl - process spawner (injected for tests).
 */
export declare function sendDesktopToast(config: DesktopToastConfig, message: NotifyMessage, logoPath: string, spawnImpl?: ToastSpawn): Promise<void>;
/**
 * Register the plugin's toast identity (idempotent). Resolves when the
 * shortcut exists; rejects on failure (toasts then fail loudly on send —
 * the caller logs the warning and disables the channel).
 * @param config - desktop toast settings.
 * @param iconPath - absolute path of the .ico.
 * @param helperPath - absolute path of the AUMID writer exe.
 * @param spawnImpl - process spawner (injected for tests).
 */
export declare function ensureDesktopAppId(config: DesktopToastConfig, iconPath: string, helperPath: string, spawnImpl?: ToastSpawn): Promise<void>;
