import { describe, expect, it } from 'vitest'
import { withDefaults } from '../src/config.ts'
import {
  desktopIdentitySignature, desktopToastSupported, encodedPowerShellCommand, ensureAppIdScript, fileUri, psQuote, sendDesktopToast, winToastScript, winToastXml, xmlEscape,
  type ToastChild,
} from '../src/desktop.ts'
import type { NotifyMessage } from '../src/messages.ts'

const config = withDefaults({ desktopToast: { enabled: true } }).desktopToast
const icon = 'C:\\icons\\dsh-notify.ico'
const logo = 'C:\\icons\\dsh-notify.png'
const message: NotifyMessage = { title: "任务'test", body: '完成 <v1> & more', tags: 'x' }

describe('psQuote', () => {
  it('wraps in single quotes and doubles embedded quotes', () => {
    expect(psQuote('plain')).toBe("'plain'")
    expect(psQuote("it's")).toBe("'it''s'")
  })
})

describe('xmlEscape / fileUri', () => {
  it('escapes XML metacharacters', () => {
    expect(xmlEscape('<a&"b\'c>')).toBe('&lt;a&amp;&quot;b&apos;c&gt;')
  })

  it('turns Windows paths into file URIs with encoded spaces', () => {
    expect(fileUri('C:\\Dev\\my icon.ico')).toBe('file:///C:/Dev/my%20icon.ico')
  })

  it('encodes fragment and query characters that encodeURI would leave in the URI', () => {
    expect(fileUri('C:\\Dev\\my #1 icon?.png')).toBe('file:///C:/Dev/my%20%231%20icon%3F.png')
  })
})

describe('winToastXml', () => {
  it('builds an adaptive toast with the logo PNG, escaped title, and escaped body', () => {
    const xml = winToastXml(message.title, message.body, logo)
    expect(xml).toContain('<binding template="ToastGeneric">')
    expect(xml).toContain('<image placement="appLogoOverride" src="file:///C:/icons/dsh-notify.png"/>')
    expect(xml).toContain('任务&apos;test')
    expect(xml).toContain('完成 &lt;v1&gt; &amp; more')
  })
})

describe('winToastScript', () => {
  it('targets the explicit AppId through the WinRT APIs', () => {
    const script = winToastScript(config, message, logo)
    expect(script).toContain('[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]')
    expect(script).toContain('CreateToastNotifier(\'Dsh.Notify\')')
    expect(script).toContain('New-Object Windows.Data.Xml.Dom.XmlDocument')
  })
})

describe('encodedPowerShellCommand', () => {
  it('round-trips through UTF-16LE base64', () => {
    const encoded = encodedPowerShellCommand('$x = 1')
    expect(Buffer.from(encoded, 'base64').toString('utf16le')).toBe('$x = 1')
  })
})

describe('desktopToastSupported', () => {
  it('accepts only win32 platforms', () => {
    expect(desktopToastSupported('win32')).toBe(true)
    expect(desktopToastSupported('linux')).toBe(false)
    expect(desktopToastSupported('darwin')).toBe(false)
  })
})

describe('desktopIdentitySignature', () => {
  it('changes with the click URL so openUrl edits re-register the shortcut', () => {
    const base = desktopIdentitySignature(config, icon)
    expect(desktopIdentitySignature({ ...config, openUrl: 'http://127.0.0.1:3081' }, icon)).not.toBe(base)
  })

  it('ignores surrounding whitespace in the click URL', () => {
    expect(desktopIdentitySignature({ ...config, openUrl: ' http://127.0.0.1:3080 ' }, icon)).toBe(desktopIdentitySignature(config, icon))
  })
})

describe('ensureAppIdScript', () => {
  const helper = 'C:\\helpers\\dsh-set-aumid.exe'

  it('verifies the registered AppId via Get-StartApps and rebuilds when missing', () => {
    const script = ensureAppIdScript(config, icon, helper)
    expect(script).toContain('Get-StartApps')
    expect(script).toContain("'Dsh.Notify'")
    expect(script).toContain("'DSH Notify'")
    expect(script).toContain("'C:\\icons\\dsh-notify.ico'")
    expect(script).toContain("'DSH Notify.lnk'")
    expect(script).toContain('WScript.Shell')
    expect(script).toContain("& 'C:\\helpers\\dsh-set-aumid.exe'")
  })

  it('re-registers when the shortcut icon changed (logo update propagation)', () => {
    const script = ensureAppIdScript(config, icon, helper)
    expect(script).toContain('$existingIcon = [string]$w0.CreateShortcut($lnk).IconLocation')
    expect(script).toContain(`$existingIcon -eq 'C:\\icons\\dsh-notify.ico'`)
  })

  it('writes the AUMID on a temp copy and moves it into the Start Menu', () => {
    const script = ensureAppIdScript(config, icon, helper)
    expect(script).toContain('$tmp = Join-Path $env:TEMP')
    expect(script).toContain('Move-Item -Force $tmp $lnk')
  })

  it('repoints the shortcut to open the configured URL on click', () => {
    const script = ensureAppIdScript(config, icon, helper)
    expect(script).toContain('cmd.exe')
    expect(script).toContain('/c start')
    expect(script).toContain("$sc.Arguments = ('/c start \"\" \"{0}\"' -f 'http://127.0.0.1:3080')")
  })

  it('escapes quotes in the click URL instead of breaking the PowerShell string', () => {
    const nasty = 'http://127.0.0.1:3080/?next="/evil'
    const script = ensureAppIdScript({ ...config, openUrl: nasty }, icon, helper)
    expect(script).toContain(`-f ${psQuote(nasty)}`)
    expect(script).not.toContain(`"" ""${nasty}"""`)
  })

  it('skips the URL repoint when openUrl is empty', () => {
    const script = ensureAppIdScript({ ...config, openUrl: '' }, icon, helper)
    expect(script).not.toContain('/c start')
  })
})

/** Minimal child-process fake. */
function fakeChild(code: number | null, error?: Error): ToastChild {
  let onError: ((e: Error) => void) | undefined
  let onClose: ((c: number | null) => void) | undefined
  const child = {
    on(event: 'error' | 'close', listener: unknown) {
      if (event === 'error') onError = listener as (e: Error) => void
      else onClose = listener as (c: number | null) => void
      return child
    },
    kill() {},
  } as unknown as ToastChild
  setTimeout(() => {
    if (error !== undefined) onError?.(error)
    else onClose?.(code)
  }, 0)
  return child
}

describe('sendDesktopToast', () => {
  it('spawns Windows PowerShell with -EncodedCommand and resolves on exit 0', async () => {
    const calls: Array<[string, string[]]> = []
    const spawnImpl = (cmd: string, args: readonly string[]) => {
      calls.push([cmd, [...args]])
      return fakeChild(0)
    }
    await expect(sendDesktopToast(config, message, logo, spawnImpl)).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
    const [cmd, args] = calls[0]
    expect(cmd).toBe('powershell')
    expect(args[0]).toBe('-NoProfile')
    expect(args[2]).toBe('-EncodedCommand')
    expect(Buffer.from(args[3], 'base64').toString('utf16le')).toContain('CreateToastNotifier')
  })

  it('rejects when the child exits non-zero', async () => {
    await expect(sendDesktopToast(config, message, logo, () => fakeChild(1))).rejects.toThrow(/exited with code 1/)
  })

  it('rejects on spawn error', async () => {
    await expect(sendDesktopToast(config, message, logo, () => fakeChild(0, new Error('spawn failed')))).rejects.toThrow('spawn failed')
  })
})
