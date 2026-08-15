import { afterEach, describe, expect, it, vi } from 'vitest'
import { apply } from '../src/client/index.ts'

/**
 * The browser entry must keep its settings page reachable even when the
 * master switch is off — otherwise a disabled plugin disappears from the
 * settings panel and can only be re-enabled by hand-editing settings.yaml.
 */
describe('client apply', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('registers the settings section while the master switch is off', () => {
    const register = vi.fn((_registration: unknown, _component: unknown) => () => {})
    const inject = vi.fn((slot: string, activate: () => void) => {
      activate()
      return () => {}
    })
    const ctx = {
      slots: { inject, register },
      effect: vi.fn((effect: () => () => void) => {
        effect()
        return () => {}
      }),
    } as unknown as Parameters<typeof apply>[0]
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true,"value":{}}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))
    const warns: unknown[] = []
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { warns.push(args) })

    apply(ctx, { enabled: false })

    expect(inject).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(register).toHaveBeenCalledTimes(1)
    const registration = register.mock.calls[0]
    expect(registration?.[0]).toMatchObject({ name: 'settings.section', id: 'dsh-notify', label: '通知' })
    expect(registration?.[1]).toBeTypeOf('function')
    // The sessions-service absence warning is unrelated noise; the contract
    // is the slot registration above, not the missing fake sessions store.
    void warns
  })
})
