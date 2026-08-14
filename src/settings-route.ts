/**
 * The plugin's own settings bridge. rc.6's web settings boundary serves only
 * a hard-coded namespace allowlist (`WEB_SETTINGS_NAMESPACES` in
 * `dsh-host-apiproxy`), so a third-party namespace is never exposed to the
 * browser and every settings page would permanently report `unavailable`.
 * These two loopback routes are the plugin-owned workaround:
 *
 * - GET  /api/dsh-notify/settings — the live resolved config (the same
 *   settings-aware value the Host halves use);
 * - POST /api/dsh-notify/settings — one path-addressed edit
 *   `{ field: "ntfy.topic", value: "…" }`, applied through the Host settings
 *   provider's `mutate` (reachable Host-side; only the wire boundary is
 *   gated).
 *
 * The routes are loopback-fenced like the dsh-ssh API family: a LAN-exposed
 * dsh web deployment must not serve them.
 *
 * @module dsh-notify/settings-route
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SettingsNamespace, SettingsProvider } from '@deepseek-ai/dsh-settings'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { NotifyConfig } from './config.ts'

/** Route path shared with the browser half. */
export const SETTINGS_API_PATH = '/api/dsh-notify/settings'

/** Cap on JSON request bodies (single field edits are tiny). */
const MAX_BODY_BYTES = 16 * 1024

/** Dependencies the route handlers act through (tests inject fakes). */
export interface SettingsRouteDeps {
  /** Live resolved config reader. */
  getConfig: () => NotifyConfig
  /** Host settings provider resolver (undefined in settings-less compositions). */
  settings: () => SettingsProvider | undefined
  /** The plugin's settings namespace (branded). */
  namespace: SettingsNamespace
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(JSON.stringify(body))
}

/** Loopback fence plus browser same-origin markers (mirrors dsh-ssh routes). */
function isLoopbackRequest(req: IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  return true
}

/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** Safe dotted-field → path conversion for the mutate API. */
function fieldPath(field: unknown): string[] | undefined {
  if (typeof field !== 'string') return undefined
  if (!/^[A-Za-z][A-Za-z0-9_.]*$/u.test(field)) return undefined
  const path = field.split('.')
  return path.length > 0 && path.every(part => part !== '') ? path : undefined
}

/** Build the settings bridge route (one exact path, method-dispatched). */
export function makeSettingsRoutes(deps: SettingsRouteDeps): WebRoute[] {
  return [{
    kind: 'exact',
    path: SETTINGS_API_PATH,
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, { ok: false, error: 'forbidden: loopback-only' })
        return
      }
      const method = req.method ?? 'GET'
      if (method === 'GET') {
        writeJson(res, 200, { ok: true, value: deps.getConfig() })
        return
      }
      if (method === 'POST') {
        const settings = deps.settings()
        if (settings === undefined) {
          writeJson(res, 503, { ok: false, error: 'settings service is absent' })
          return
        }
        const body = await readJsonBody(req)
        if (body === undefined) {
          writeJson(res, 400, { ok: false, error: 'invalid JSON body' })
          return
        }
        const path = fieldPath(body.field)
        if (path === undefined) {
          writeJson(res, 400, { ok: false, error: 'field must be a dotted key path' })
          return
        }
        try {
          await settings.mutate(deps.namespace, [{ op: 'set', path, value: body.value }])
          writeJson(res, 200, { ok: true })
        } catch (error) {
          writeJson(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
        }
        return
      }
      writeJson(res, 405, { ok: false, error: `method not allowed: ${method}` })
    },
  }]
}
