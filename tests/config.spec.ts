import { describe, expect, it } from 'vitest'
import { NOTIFY_DEFAULTS, withDefaults } from '../src/config.ts'

describe('withDefaults', () => {
  it('fills a null config with every default', () => {
    expect(withDefaults(null)).toEqual(NOTIFY_DEFAULTS)
  })

  it('merges partial top-level and ntfy fields', () => {
    const config = withDefaults({ onCompletion: false, ntfy: { enabled: true, topic: 'my-topic' } })
    expect(config.onCompletion).toBe(false)
    expect(config.onApproval).toBe(true)
    expect(config.ntfy).toMatchObject({ enabled: true, topic: 'my-topic', server: 'https://ntfy.sh' })
  })

  it('keeps explicit false values instead of replacing them with defaults', () => {
    expect(withDefaults({ enabled: false }).enabled).toBe(false)
    expect(withDefaults({ onStart: true }).onStart).toBe(true)
  })

  it('merges the custom title and the desktop logo path', () => {
    const config = withDefaults({ customTitle: '【提醒】', desktopToast: { logoPath: 'D:\\logo.ico' } })
    expect(config.customTitle).toBe('【提醒】')
    expect(config.desktopToast.logoPath).toBe('D:\\logo.ico')
    expect(withDefaults(null).customTitle).toBe('')
    expect(withDefaults(null).desktopToast.logoPath).toBe('')
  })
})
