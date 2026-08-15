import { describe, expect, it, vi } from 'vitest'
import { NOTIFY_DEFAULTS } from '../src/config.ts'
import { completionMessage } from '../src/messages.ts'
import { ntfyRequest, ntfyUrl, publishNtfy } from '../src/ntfy.ts'

const ntfy = { ...NOTIFY_DEFAULTS.ntfy, enabled: true, topic: 'my-topic' }

describe('ntfyUrl', () => {
  it('strips trailing slashes and encodes the topic', () => {
    expect(ntfyUrl('https://ntfy.sh/', 'my/topic')).toBe('https://ntfy.sh/my%2Ftopic')
    expect(ntfyUrl('https://self.hosted', 'plain')).toBe('https://self.hosted/plain')
  })
})

describe('ntfyRequest', () => {
  it('carries Title/Priority/Tags headers and the message body', () => {
    const request = ntfyRequest({ ...ntfy, priority: 'high', tags: 'lock' }, completionMessage('zh', '测试'))
    expect(request.url).toBe('https://ntfy.sh/my-topic')
    expect(request.init.method).toBe('POST')
    expect(request.init.body).toContain('测试')
    const headers = request.init.headers as Record<string, string>
    expect(headers.Title).toBe('任务执行完毕')
    expect(headers.Priority).toBe('high')
    expect(headers.Tags).toBe('white_check_mark')
  })

  it('prefers the per-message situation tags and falls back to the configured tags', () => {
    const withSituation = ntfyRequest({ ...ntfy, tags: 'robot' }, completionMessage('zh', '测试'))
    expect((withSituation.init.headers as Record<string, string>).Tags).toBe('white_check_mark')
    const tagless = { title: '自定义', body: '无标签', tags: '' }
    const fallback = ntfyRequest({ ...ntfy, tags: 'robot' }, tagless)
    expect((fallback.init.headers as Record<string, string>).Tags).toBe('robot')
  })

  it('adds Authorization and Click headers only when configured', () => {
    const bare = ntfyRequest(ntfy, completionMessage('en', 'demo'))
    expect('Authorization' in (bare.init.headers as object)).toBe(false)
    expect('Click' in (bare.init.headers as object)).toBe(false)
    const full = ntfyRequest({ ...ntfy, token: 'secret', clickUrl: 'http://127.0.0.1:3080' }, completionMessage('en', 'demo'))
    const headers = full.init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer secret')
    expect(headers.Click).toBe('http://127.0.0.1:3080')
  })
})

describe('publishNtfy', () => {
  it('resolves on a 2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    await expect(publishNtfy(ntfy, completionMessage('zh', 'x'), fetchImpl)).resolves.toBeUndefined()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('rejects on a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 403 })) as unknown as typeof fetch
    await expect(publishNtfy(ntfy, completionMessage('zh', 'x'), fetchImpl)).rejects.toThrow('HTTP 403')
  })

  it('rejects on transport failure', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network down') }) as unknown as typeof fetch
    await expect(publishNtfy(ntfy, completionMessage('zh', 'x'), fetchImpl)).rejects.toThrow('network down')
  })
})
