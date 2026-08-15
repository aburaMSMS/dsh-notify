/**
 * ntfy.sh publish helpers: pure request construction plus an injectable
 * fetch-based publisher. The host half calls `publishNtfy` fire-and-forget;
 * the fetch implementation is a parameter so tests can drive failures
 * without a network.
 *
 * @module dsh-notify/ntfy
 */

import type { NtfyConfig } from './config.ts'
import type { NotifyMessage } from './messages.ts'

/** ntfy topic publish endpoint (trailing slashes stripped, topic encoded). */
export function ntfyUrl(server: string, topic: string): string {
  return `${server.replace(/\/+$/u, '')}/${encodeURIComponent(topic)}`
}

/** A ready-to-send ntfy publish request. */
export interface NtfyPublishRequest {
  url: string
  init: RequestInit
}

/**
 * Build the ntfy publish request for one message.
 * @param ntfy - resolved ntfy settings.
 * @param message - the notification to publish. The message's own tags
 *   (per-situation emoji tags) win; the configured `ntfy.tags` is the
 *   fallback for tag-less service messages.
 * @returns URL and fetch init (headers carry Title/Priority/Tags and the
 *   optional Authorization and Click headers).
 */
export function ntfyRequest(ntfy: NtfyConfig, message: NotifyMessage): NtfyPublishRequest {
  const headers: Record<string, string> = {
    Title: message.title,
    Priority: ntfy.priority,
    Tags: message.tags.trim() === '' ? ntfy.tags : message.tags,
  }
  if (ntfy.token.trim() !== '') headers.Authorization = `Bearer ${ntfy.token}`
  if (ntfy.clickUrl.trim() !== '') headers.Click = ntfy.clickUrl
  return {
    url: ntfyUrl(ntfy.server, ntfy.topic),
    init: { method: 'POST', headers, body: message.body },
  }
}

const PUBLISH_TIMEOUT_MS = 10_000

/**
 * Publish one message to the configured ntfy topic.
 * @param ntfy - resolved ntfy settings (enabled + non-empty topic assumed).
 * @param message - the notification to publish.
 * @param fetchImpl - fetch implementation (injected for tests).
 * @throws when the transport fails or the server answers non-2xx.
 */
export async function publishNtfy(ntfy: NtfyConfig, message: NotifyMessage, fetchImpl: typeof fetch = fetch): Promise<void> {
  const request = ntfyRequest(ntfy, message)
  const response = await fetchImpl(request.url, { ...request.init, signal: AbortSignal.timeout(PUBLISH_TIMEOUT_MS) })
  if (!response.ok) {
    throw new Error(`ntfy publish failed: HTTP ${response.status}`)
  }
}
