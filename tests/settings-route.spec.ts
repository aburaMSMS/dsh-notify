import { describe, expect, it, vi } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SettingsNamespace, SettingsProvider } from '@deepseek-ai/dsh-settings'
import { withDefaults } from '../src/config.ts'
import { makeSettingsRoutes, PRESENCE_API_PATH, SETTINGS_API_PATH } from '../src/settings-route.ts'

const namespace = 'dsh-notify' as unknown as SettingsNamespace
const getConfig = () => withDefaults({})
const onPresence = vi.fn()

const deps = (over: Partial<Parameters<typeof makeSettingsRoutes>[0]> = {}) => ({
  getConfig,
  settings: () => undefined,
  namespace,
  onPresence,
  ...over,
})

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
  it('registers the exact settings and presence paths', () => {
    const routes = makeSettingsRoutes(deps())
    expect(routes).toHaveLength(2)
    expect(routes.map(route => route.path)).toEqual([SETTINGS_API_PATH, PRESENCE_API_PATH])
  })

  it('GET returns the live resolved config with no-store', async () => {
    const routes = makeSettingsRoutes(deps())
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
    const routes = makeSettingsRoutes(deps({ settings: () => settings }))
    const { res, status, body } = fakeResponse()
    await routes[0].handler(fakeRequest('POST', { field: 'ntfy.topic', value: 'my-topic' }), res)
    expect(status()).toBe(200)
    expect((body() as { ok: boolean }).ok).toBe(true)
    expect(mutate).toHaveBeenCalledOnce()
    expect(mutate).toHaveBeenCalledWith(namespace, [{ op: 'set', path: ['ntfy', 'topic'], value: 'my-topic' }])
  })

  it('POST rejects malformed field paths', async () => {
    const settings = { mutate: vi.fn(async () => {}) } as unknown as SettingsProvider
    const routes = makeSettingsRoutes(deps({ settings: () => settings }))
    const { res, status } = fakeResponse()
    await routes[0].handler(fakeRequest('POST', { field: '../secret', value: 1 }), res)
    expect(status()).toBe(400)
  })

  it('POST answers 503 when no settings service exists', async () => {
    const routes = makeSettingsRoutes(deps())
    const { res, status } = fakeResponse()
    await routes[0].handler(fakeRequest('POST', { field: 'enabled', value: true }), res)
    expect(status()).toBe(503)
  })

  it('rejects unsupported methods', async () => {
    const routes = makeSettingsRoutes(deps())
    const { res, status } = fakeResponse()
    await routes[0].handler(fakeRequest('DELETE'), res)
    expect(status()).toBe(405)
  })

  it('refuses non-loopback clients', async () => {
    const routes = makeSettingsRoutes(deps())
    const req = fakeRequest('GET')
    ;(req as { socket: { remoteAddress: string } }).socket.remoteAddress = '192.168.1.5'
    const { res, status } = fakeResponse()
    await routes[0].handler(req, res)
    expect(status()).toBe(403)
  })

  it('presence POST forwards the active flag to the host sink', async () => {
    onPresence.mockClear()
    const routes = makeSettingsRoutes(deps())
    const { res, status, body } = fakeResponse()
    await routes[1].handler(fakeRequest('POST', { active: true }), res)
    expect(status()).toBe(200)
    expect((body() as { ok: boolean }).ok).toBe(true)
    expect(onPresence).toHaveBeenCalledOnce()
    expect(onPresence).toHaveBeenCalledWith(true)

    onPresence.mockClear()
    await routes[1].handler(fakeRequest('POST', { active: false }), res)
    expect(onPresence).toHaveBeenCalledWith(false)
  })

  it('presence POST rejects non-boolean active flags', async () => {
    onPresence.mockClear()
    const routes = makeSettingsRoutes(deps())
    const { res, status } = fakeResponse()
    await routes[1].handler(fakeRequest('POST', { active: 'yes' }), res)
    expect(status()).toBe(400)
    expect(onPresence).not.toHaveBeenCalled()
  })

  it('presence route is loopback-fenced', async () => {
    const routes = makeSettingsRoutes(deps())
    const req = fakeRequest('POST', { active: true })
    ;(req as { socket: { remoteAddress: string } }).socket.remoteAddress = '192.168.1.5'
    const { res, status } = fakeResponse()
    await routes[1].handler(req, res)
    expect(status()).toBe(403)
  })
})
