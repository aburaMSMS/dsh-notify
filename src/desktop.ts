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

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import type { DesktopToastConfig } from './config.ts'
import type { NotifyMessage } from './messages.ts'

/** Escape a string as a PowerShell single-quoted literal ('' doubles a quote). */
export function psQuote(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`
}

/** Escape text for inclusion in toast XML character data. */
export function xmlEscape(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;')
    .replace(/'/gu, '&apos;')
}

/** Encode every slash-separated segment of a URI path (slashes stay literal). */
function encodeUriPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

/**
 * Build a file:// URI from an absolute Windows path. The encoding is
 * platform-independent (the host may run tests/builds outside Windows) and
 * encodes `#`, `?`, `%`, spaces, and unicode per segment while keeping the
 * drive letter and UNC server/share syntax.
 */
export function fileUri(path: string): string {
  const normalized = path.replace(/\\/gu, '/')
  const drive = /^([A-Za-z]):\/(.*)$/u.exec(normalized)
  if (drive !== null) return `file:///${drive[1]}:/${encodeUriPath(drive[2])}`
  if (normalized.startsWith('//')) return `file://${encodeUriPath(normalized.slice(2))}`
  return `file:///${encodeUriPath(normalized)}`
}

/** Whether the desktop toast channel can run on this platform (WinRT/PowerShell path is Windows-only). */
export function desktopToastSupported(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32'
}

/** Signature of the toast identity: every shortcut-affecting setting must be part of it. */
export function desktopIdentitySignature(config: DesktopToastConfig, iconPath: string): string {
  return `${config.appId}\u0000${config.appName}\u0000${iconPath}\u0000${config.openUrl.trim()}`
}

/**
 * Build the WinRT toast XML for one notification.
 * @param title - toast headline.
 * @param body - toast body.
 * @param logoPath - absolute path of the PNG shown inside the toast
 *   (appLogoOverride; toast rendering does not support .ico).
 * @returns adaptive toast XML.
 */
export function winToastXml(title: string, body: string, logoPath: string): string {
  return '<toast><visual><binding template="ToastGeneric">'
    + `<image placement="appLogoOverride" src="${fileUri(logoPath)}"/>`
    + `<text>${xmlEscape(title)}</text>`
    + `<text>${xmlEscape(body)}</text>`
    + '</binding></visual></toast>'
}

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
export function winToastScript(config: DesktopToastConfig, message: NotifyMessage, logoPath: string): string {
  const xml = psQuote(winToastXml(message.title, message.body, logoPath))
  return [
    "$ErrorActionPreference = 'Stop'",
    '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
    '[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null',
    `$xml = ${xml}`,
    '$doc = New-Object Windows.Data.Xml.Dom.XmlDocument',
    '$doc.LoadXml($xml)',
    '$toast = New-Object Windows.UI.Notifications.ToastNotification $doc',
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${psQuote(config.appId)}).Show($toast)`,
  ].join('\n')
}

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
export function ensureAppIdScript(config: DesktopToastConfig, iconPath: string, helperPath: string): string {
  const shortcut = psQuote(`${config.appName}.lnk`)
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    '$lnk = Join-Path ([Environment]::GetFolderPath(\'ApplicationData\')) \'Microsoft\\Windows\\Start Menu\\Programs\'',
    `$lnk = Join-Path $lnk ${shortcut}`,
    // Idempotence: skip only when the registered AppId, the shortcut's
    // current icon, AND its click target all match — changing openUrl or the
    // icon re-registers the identity.
    '$existingIcon = \'\'',
    '$existingArgs = \'\'',
    'if (Test-Path -LiteralPath $lnk) {',
    '  $w0 = New-Object -ComObject WScript.Shell',
    '  $sc0 = $w0.CreateShortcut($lnk)',
    '  $existingIcon = [string]$sc0.IconLocation',
    '  $existingArgs = [string]$sc0.Arguments',
    '}',
  ]
  if (config.openUrl.trim() !== '') {
    // The URL travels as a PowerShell single-quoted value and is substituted
    // into the cmd argument template with -f, so quotes/backticks/$ in the URL
    // stay data instead of becoming shell syntax. The stored value is:
    // /c start "" "http://…" (cmd opens the URL, no window lingers).
    lines.push(`$expectedArgs = ('/c start "" "{0}"' -f ${psQuote(config.openUrl.trim())})`)
  } else {
    lines.push("$expectedArgs = ''")
  }
  lines.push(
    '$need = $true',
    `$apps = @(Get-StartApps -ErrorAction SilentlyContinue | Where-Object { $_.Name -eq ${psQuote(config.appName)} })`,
    `if ($apps.Count -gt 0 -and $apps[0].AppID -eq ${psQuote(config.appId)} -and $existingIcon -eq ${psQuote(iconPath)} -and $existingArgs -eq $expectedArgs) { $need = $false }`,
    'if ($need) {',
    "  $tmp = Join-Path $env:TEMP ('dsh-notify-' + [guid]::NewGuid().ToString('N') + '.lnk')",
    '  $ws = New-Object -ComObject WScript.Shell',
    '  $sc = $ws.CreateShortcut($tmp)',
    "  $sc.TargetPath = (Get-Command cmd.exe).Source",
  )
  if (config.openUrl.trim() !== '') {
    // The URL travels as a PowerShell single-quoted value and is substituted
    // into the cmd argument template with -f, so quotes/backticks/$ in the URL
    // stay data instead of becoming shell syntax. The stored value is:
    // /c start "" "http://…" (cmd opens the URL, no window lingers).
    lines.push(`  $sc.Arguments = ('/c start "" "{0}"' -f ${psQuote(config.openUrl.trim())})`)
  }
  lines.push(
    '  $sc.WorkingDirectory = $env:TEMP',
    `  $sc.IconLocation = ${psQuote(iconPath)}`,
    `  $sc.Description = ${psQuote(config.appName)}`,
    '  $sc.Save()',
    `  & ${psQuote(helperPath)} $tmp ${psQuote(config.appId)}`,
    '  if ($LASTEXITCODE -ne 0) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue; throw "dsh-set-aumid failed with exit code $LASTEXITCODE" }',
    '  if (Test-Path -LiteralPath $lnk) { Remove-Item -LiteralPath $lnk -Force -ErrorAction SilentlyContinue }',
    '  Move-Item -Force $tmp $lnk',
    '}',
  )
  return lines.join('\n')
}

/** Absolute path of the packaged AUMID writer exe (lib/ → package root/assets). */
export function desktopAumidHelperPath(): string {
  return fileURLToPath(new URL('../assets/dsh-set-aumid.exe', import.meta.url))
}

/** Encode a script for `powershell -EncodedCommand` (requires UTF-16LE base64). */
export function encodedPowerShellCommand(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/** Absolute path of the packaged shortcut icon (lib/ → package root/assets; .ico). */
export function desktopIconPath(): string {
  return fileURLToPath(new URL('../assets/dsh-notify.ico', import.meta.url))
}

/** Absolute path of the packaged toast logo image (lib/ → package root/assets; PNG). */
export function desktopLogoPath(): string {
  return fileURLToPath(new URL('../assets/dsh-notify.png', import.meta.url))
}

/** Minimal child-process face the spawn wrapper needs (test double friendly). */
export interface ToastChild {
  on(event: 'error', listener: (error: Error) => void): ToastChild
  on(event: 'close', listener: (code: number | null) => void): ToastChild
  kill(): void
}

/** Spawn signature compatible with `node:child_process.spawn`. */
export type ToastSpawn = (command: string, args: readonly string[], options: object) => ToastChild

/** Run one PowerShell script through `-EncodedCommand`, resolving on exit 0. */
function runPowerShell(config: DesktopToastConfig, script: string, spawnImpl: ToastSpawn): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const args = ['-NoProfile', '-NonInteractive', '-EncodedCommand', encodedPowerShellCommand(script)]
    let child: ToastChild
    try {
      child = spawnImpl(config.shell, args, { stdio: 'ignore', windowsHide: true })
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)))
      return
    }
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error(`PowerShell command timed out after ${config.timeoutMs}ms`))
    }, config.timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error(`${config.shell} exited with code ${String(code)}`))
    })
  })
}

/**
 * Raise one Windows toast. Resolves when the toast process exits cleanly;
 * rejects on spawn errors, non-zero exit, or timeout.
 * @param config - desktop toast settings (shell + timeout).
 * @param message - the notification.
 * @param logoPath - absolute path of the PNG shown inside the toast.
 * @param spawnImpl - process spawner (injected for tests).
 */
export function sendDesktopToast(config: DesktopToastConfig, message: NotifyMessage, logoPath: string, spawnImpl: ToastSpawn = spawn as unknown as ToastSpawn): Promise<void> {
  return runPowerShell(config, winToastScript(config, message, logoPath), spawnImpl)
}

/**
 * Register the plugin's toast identity (idempotent). Resolves when the
 * shortcut exists; rejects on failure (toasts then fail loudly on send —
 * the caller logs the warning and disables the channel).
 * @param config - desktop toast settings.
 * @param iconPath - absolute path of the .ico.
 * @param helperPath - absolute path of the AUMID writer exe.
 * @param spawnImpl - process spawner (injected for tests).
 */
export function ensureDesktopAppId(config: DesktopToastConfig, iconPath: string, helperPath: string, spawnImpl: ToastSpawn = spawn as unknown as ToastSpawn): Promise<void> {
  return runPowerShell(config, ensureAppIdScript(config, iconPath, helperPath), spawnImpl)
}
