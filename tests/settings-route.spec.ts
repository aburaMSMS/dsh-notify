import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SettingsNamespace, SettingsProvider } from '@deepseek-ai/dsh-settings'
import { withDefaults } from '../src/config.ts'
import { makeSettingsRoutes, SETTINGS_API_PATH } from '../src/settings-route.ts'

const namespace = 'dsh-notify' as unknown as SettingsNamespace
const getConfig = () => withDefaults({})

/** Fake request carrying an optional JSON body. */
function fakeRequest(method: string, body?: unknown): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  const req = {
    method,
    socket: { remoteAddress: '127.0.0.1' },
    headers: {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  } as unknown as IncomingMessage
  return req
}

/** Fake response capturing status and payload. */
function fakeResponse(): { res: ServerResponse; status: () => number; body: () => unknown } {
  let status = 0
  let payload = ''
  const res = {
    writeHead(code: number) {
      status = code
    },
    end(data: string) {
      payload = data
    },
  } as unknown as ServerResponse
  return { res, status: () => status, body: () => JSON.parse(payload) as unknown }
}

describe('makeSettingsRoutes', () => {
  it('registers the exact settings path', () => {
    const routes = makeSettingsRoutes({ getConfig, settings: () => undefined, namespace })
    expect(routes).toHaveLength(1)
    expect(routes[0].path).toBe(SETTINGS_API_PATH)
  })

  it('GET returns the live resolved config with no-store', async () => {
    const routes = makeSettingsRoutes({ getConfig, settings: () => undefined, namespace })
    const { res, status, body } = fakeResponse()
    await routes[0].handler(fakeRequest('GET'), res)
    expect(status()).toBe(200)
    const parsed = body() as { ok: boolean; value: Record<string, unknown> }
    expect(parsed.ok).toBe(true)
    expect(parsed.value.enabled).toBe(true)
  })

  it('POST applies a dotted-field edit through the settings provider', async () => {
    const mutate = vi.fn(async () => {})
    const settings = { mutate } as unknown as SettingsProvider
    const routes = makeSettingsRoutes({ getConfig, settings: () => settings, namespace })
    const { res, status, body } = fakeResponse()
    await routes[0].handler(fakeRequest('POST', { field: 'ntfy.topic', value: 'my-topic' }), res)
    expect(status()).toBe(200)
    expect((body() as { ok: boolean }).ok).toBe(true)
    expect(mutate).toHaveBeenCalledOnce()
    expect(mutate).toHaveBeenCalledWith(namespace, [{ op: 'set', path: ['ntfy', 'topic'], value: 'my-topic' }])
  })

  it('POST rejects malformed field paths', async () => {
    const settings = { mutate: vi.fn(async () => {}) } as unknown as SettingsProvider
    const routes = makeSettingsRoutes({ getConfig, settings: () => settings, namespace })
    const { res, status } = fakeResponse()
    await routes[0].handler(fakeRequest('POST', { field: '../secret', value: 1 }), res)
    expect(status()).toBe(400)
  })

  it('POST answers 503 when no settings service exists', async () => {
    const routes = makeSettingsRoutes({ getConfig, settings: () => undefined, namespace })
    const { res, status } = fakeResponse()
    await routes[0].handler(fakeRequest('POST', { field: 'enabled', value: true }), res)
    expect(status()).toBe(503)
  })

  it('rejects unsupported methods', async () => {
    const routes = makeSettingsRoutes({ getConfig, settings: () => undefined, namespace })
    const { res, status } = fakeResponse()
    await routes[0].handler(fakeRequest('DELETE'), res)
    expect(status()).toBe(405)
  })

  it('refuses non-loopback clients', async () => {
    const routes = makeSettingsRoutes({ getConfig, settings: () => undefined, namespace })
    const req = fakeRequest('GET')
    ;(req as { socket: { remoteAddress: string } }).socket.remoteAddress = '192.168.1.5'
    const { res, status } = fakeResponse()
    await routes[0].handler(req, res)
    expect(status()).toBe(403)
  })
})
