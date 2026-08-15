/**
 * Host integration test: instantiates the real NotifyService inside a cordis
 * Context, drives the three notification triggers through the event surface
 * (`agent/status`, `approval/request`, `session/event`), and asserts the
 * ntfy publishes by stubbing the global fetch. This covers the actual
 * listener wiring and config gating — not just the pure builders.
 */
import { Context } from '@deepseek-ai/cordis'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session } from '@deepseek-ai/dsh-session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import NotifyService from '../src/index.ts'
import type { NotifyConfig, PartialNotifyConfig } from '../src/config.ts'

/** Minimal concrete settings provider (in-memory document). */
class FakeSettingsProvider extends SettingsProvider {
  readonly writable = true
  protected async load(): Promise<Record<string, unknown>> {
    return {}
  }
  protected async persist(): Promise<void> {}
}

/** Test fakes are minimal; the plugin only reads the fields it uses. */
const session = { id: 'sess-1', header: { cwd: 'D:/work/demo' } } as unknown as Session

const rootAgent = { session } as unknown as Agent
const childAgent = { session: { ...session, id: 'sess-child' } } as unknown as Agent

/** Config accepted by cordis plugin() (typed as the schema output). */
const cfg = (value: PartialNotifyConfig): NotifyConfig => value as unknown as NotifyConfig

interface FetchMock {
  calls: Array<[string, RequestInit]>
}

function installFetchMock(): FetchMock {
  const mock: FetchMock = { calls: [] }
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    mock.calls.push([url, init])
    return new Response(null, { status: 200 })
  }) as unknown as typeof fetch
  vi.stubGlobal('fetch', fetchImpl)
  return mock
}

/** ntfy-enabled config with a real topic (so publishes are attempted). */
const ntfyConfig = () => cfg({ ntfy: { enabled: true, topic: 'my-topic', priority: 'high' } })

/** Provide a fake agents registry that treats `rootAgent` as the only root. */
function provideAgents(root: Context): void {
  const registry = {
    roots: () => [rootAgent],
    get: (id: string) => (id === rootAgent.session.id ? rootAgent : childAgent),
  }
  ;(root as unknown as { reflect: { provide(name: string, value: unknown): unknown } })
    .reflect.provide('agents', registry)
}

/**
 * Emit through the loose cordis signature: scoped events (session/event,
 * agent/status) type their dispatch as `emit(thisArg, name, ...)` while this
 * test emits from the root without a scope target.
 */
function emitEvent(root: Context, name: string, ...args: unknown[]): void {
  ;(root.emit as (eventName: string, ...eventArgs: unknown[]) => void)(name, ...args)
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('NotifyService in a cordis composition', () => {
  it('starts cleanly with a valid config', async () => {
    const root = new Context()
    await root.plugin(NotifyService, ntfyConfig())
    expect((root as unknown as { get(name: string): unknown }).get('notify')).toBeDefined()
  })

  it('registers the settings namespace when a settings provider exists', async () => {
    const root = new Context()
    await root.plugin(FakeSettingsProvider)
    await root.plugin(NotifyService, cfg({}))
    const provider = root.get('settings') as SettingsProvider
    const descriptors = provider.describe({})
    expect(descriptors.some(descriptor => String(descriptor.ns) === 'dsh-notify')).toBe(true)
  })

  it('registers the settings bridge routes when the web server exists', async () => {
    const root = new Context()
    const registered: unknown[] = []
    ;(root as unknown as { reflect: { provide(name: string, value: unknown): unknown } }).reflect.provide('webServer', {
      register: (route: unknown) => {
        registered.push(route)
        return () => {}
      },
    })
    await root.plugin(NotifyService, cfg({}))
    expect(registered).toHaveLength(1)
    expect((registered[0] as { path: string }).path).toBe('/api/dsh-notify/settings')
  })

  it('registers the bridge routes lazily when the web server appears later', async () => {
    const root = new Context()
    const registered: unknown[] = []
    await root.plugin(NotifyService, cfg({}))
    expect(registered).toHaveLength(0)
    ;(root as unknown as { reflect: { provide(name: string, value: unknown): unknown } }).reflect.provide('webServer', {
      register: (route: unknown) => {
        registered.push(route)
        return () => {}
      },
    })
    // The inject child fiber activates once the service appears.
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(registered).toHaveLength(1)
    expect((registered[0] as { path: string }).path).toBe('/api/dsh-notify/settings')
  })

  it('fails loud when ntfy is enabled without a topic', async () => {
    const root = new Context()
    await expect(
      root.plugin(NotifyService, cfg({ ntfy: { enabled: true, topic: '' } })),
    ).rejects.toThrow(/topic/i)
  })

  it('publishes a completion notification when a root agent goes idle', async () => {
    const root = new Context()
    provideAgents(root)
    const fetchMock = installFetchMock()
    await root.plugin(NotifyService, ntfyConfig())

    root.emit('agent/status', { agent: rootAgent, status: 'idle' })
    root.emit('agent/status', { agent: childAgent, status: 'idle' })

    expect(fetchMock.calls).toHaveLength(1)
    const [url, init] = fetchMock.calls[0]
    expect(url).toBe('https://ntfy.sh/my-topic')
    const headers = init.headers as Record<string, string>
    expect(headers.Title).toBe('任务执行完毕')
    expect(headers.Tags).toBe('white_check_mark')
    expect(String(init.body)).toContain('demo')
  })

  it('applies the custom title when configured', async () => {
    const root = new Context()
    const fetchMock = installFetchMock()
    await root.plugin(NotifyService, cfg({ customTitle: '【DSH】提醒', ntfy: { enabled: true, topic: 'my-topic' } }))

    root.emit('agent/status', { agent: rootAgent, status: 'idle' })

    expect(fetchMock.calls).toHaveLength(1)
    const headers = fetchMock.calls[0][1].headers as Record<string, string>
    expect(headers.Title).toBe('【DSH】提醒')
  })

  it('observes the approval waterfall without short-circuiting it', async () => {
    const root = new Context()
    const fetchMock = installFetchMock()
    await root.plugin(NotifyService, ntfyConfig())

    const outcome = await root.waterfall(
      'approval/request',
      { agent: rootAgent, toolName: 'bash', reason: '删除文件' },
      () => Promise.resolve('allowed-once' as const),
    )

    expect(outcome).toBe('allowed-once')
    expect(fetchMock.calls).toHaveLength(1)
    const headers = fetchMock.calls[0][1].headers as Record<string, string>
    expect(headers.Title).toBe('需要权限许可')
    expect(String(fetchMock.calls[0][1].body)).toContain('bash')
  })

  it('publishes a question notification for ask_user_question tool calls', async () => {
    const root = new Context()
    provideAgents(root)
    const fetchMock = installFetchMock()
    await root.plugin(NotifyService, ntfyConfig())

    emitEvent(root, 'session/event', session, {
      type: 'tool/call', seq: 1, time: 0,
      data: { turn: 1, step: 1, callId: 'c1', name: 'ask_user_question', arguments: '{}' },
    })
    emitEvent(root, 'session/event', session, {
      type: 'tool/call', seq: 2, time: 0,
      data: { turn: 1, step: 1, callId: 'c2', name: 'bash', arguments: '{}' },
    })

    expect(fetchMock.calls).toHaveLength(1)
    expect(fetchMock.calls[0][0]).toBe('https://ntfy.sh/my-topic')
    const headers = fetchMock.calls[0][1].headers as Record<string, string>
    expect(headers.Title).toBe('需要你回答')
  })

  it('honors the per-situation switches and the master switch', async () => {
    const root = new Context()
    const fetchMock = installFetchMock()
    await root.plugin(NotifyService, cfg({ onCompletion: false, onApproval: false, ntfy: { enabled: true, topic: 'my-topic' } }))

    root.emit('agent/status', { agent: rootAgent, status: 'idle' })
    await root.waterfall('approval/request', { agent: rootAgent, toolName: 'bash' }, () => Promise.resolve('unavailable' as const))
    emitEvent(root, 'session/event', session, {
      type: 'tool/call', seq: 1, time: 0,
      data: { turn: 1, step: 1, callId: 'c1', name: 'ask_user_question', arguments: '{}' },
    })

    expect(fetchMock.calls).toHaveLength(1)
    const headers = fetchMock.calls[0][1].headers as Record<string, string>
    expect(headers.Title).toBe('需要你回答')
  })

  it('logs but does not publish when ntfy is disabled', async () => {
    const root = new Context()
    const fetchMock = installFetchMock()
    await root.plugin(NotifyService, cfg({ ntfy: { enabled: false } }))

    root.emit('agent/status', { agent: rootAgent, status: 'idle' })

    expect(fetchMock.calls).toHaveLength(0)
  })
})
