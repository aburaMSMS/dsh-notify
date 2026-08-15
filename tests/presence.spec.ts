import { describe, expect, it, vi } from 'vitest'
import { createPresenceReporter, isPageActive, type PresenceHost, type PresencePage } from '../src/client/presence.ts'

/** Mutable fake page for presence tests. */
function fakePage(visible = true, focused = true): PresencePage & {
  focused: boolean
  visible: boolean
  fire(type: string): void
} {
  const listeners = new Map<string, () => void>()
  const page = {
    visible,
    focused,
    get visibilityState() {
      return page.visible ? 'visible' : 'hidden'
    },
    hasFocus: () => page.focused,
    addEventListener: (type: string, listener: () => void) => { listeners.set(type, listener) },
    removeEventListener: (type: string) => { listeners.delete(type) },
    fire(type: string) {
      listeners.get(type)?.()
    },
  }
  return page
}

/** Fake window host keeping listeners and the interval callback reachable. */
function fakeHost(): PresenceHost & { fire(type: string): void; heartbeat(): void } {
  const listeners = new Map<string, () => void>()
  let interval: (() => void) | undefined
  return {
    addEventListener: (type, listener) => { listeners.set(type, listener) },
    removeEventListener: (type) => { listeners.delete(type) },
    setInterval: (handler) => {
      interval = handler
      return 1
    },
    clearInterval: () => { interval = undefined },
    fire(type) {
      listeners.get(type)?.()
    },
    heartbeat() {
      interval?.()
    },
  }
}

describe('isPageActive', () => {
  it('is active only while the page is visible AND focused', () => {
    expect(isPageActive(fakePage())).toBe(true)
    expect(isPageActive(fakePage(true, false))).toBe(false)
    expect(isPageActive(fakePage(false, true))).toBe(false)
  })
})

describe('createPresenceReporter', () => {
  it('reports the initial state and every transition', () => {
    const page = fakePage()
    const host = fakeHost()
    const reports: boolean[] = []
    createPresenceReporter(page, host, active => { reports.push(active) })
    expect(reports).toEqual([true])

    page.focused = false
    host.fire('blur')
    expect(reports).toEqual([true, false])

    page.focused = true
    host.fire('focus')
    expect(reports).toEqual([true, false, true])

    page.visible = false
    page.fire('visibilitychange')
    expect(reports).toEqual([true, false, true, false])
  })

  it('refreshes the same active state on every heartbeat', () => {
    const page = fakePage()
    const host = fakeHost()
    const reports: boolean[] = []
    createPresenceReporter(page, host, active => { reports.push(active) })

    host.heartbeat()
    host.heartbeat()
    expect(reports).toEqual([true, true, true])
  })

  it('reports absence on dispose so desktop toasts re-arm immediately', () => {
    const page = fakePage()
    const host = fakeHost()
    const reports: boolean[] = []
    const dispose = createPresenceReporter(page, host, active => { reports.push(active) })

    dispose()
    expect(reports.at(-1)).toBe(false)
  })
})
