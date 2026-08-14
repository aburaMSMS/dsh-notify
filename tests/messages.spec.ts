import { describe, expect, it } from 'vitest'
import {
  applyCustomTitle, approvalMessage, completionMessage, planReviewMessage, questionMessage, startMessage,
} from '../src/messages.ts'

describe('notify messages', () => {
  it('builds zh completion copy', () => {
    const message = completionMessage('zh', '部署脚本')
    expect(message.title).toBe('任务执行完毕')
    expect(message.body).toBe('「部署脚本」已执行完毕，需要你查看')
    expect(message.tags).toBe('white_check_mark')
  })

  it('builds en completion copy', () => {
    const message = completionMessage('en', 'deploy')
    expect(message.title).toBe('Task finished')
    expect(message.body).toBe('"deploy" has finished and needs your attention')
  })

  it('appends an approval reason with the language-appropriate separator', () => {
    const zh = approvalMessage('zh', '会话', 'bash', '删除文件')
    expect(zh.body).toBe('「会话」中，工具 bash 请求许可：删除文件')
    const en = approvalMessage('en', 'demo', 'bash', 'delete files')
    expect(en.body).toBe('Tool bash in "demo" requests permission: delete files')
  })

  it('omits the reason when absent and falls back to generic copy without a tool name', () => {
    const generic = approvalMessage('zh', '会话')
    expect(generic.body).toBe('「会话」中有工具请求许可')
    expect(generic.title).toBe('需要权限许可')
  })

  it('clamps very long reasons', () => {
    const reason = 'x'.repeat(300)
    const message = approvalMessage('zh', '会话', 'bash', reason)
    expect(message.body).toContain(`${'x'.repeat(140)}…`)
    expect(message.body.length).toBeLessThan(200)
  })

  it('builds question, plan-review, and start copy', () => {
    expect(questionMessage('zh', '会话').title).toBe('需要你回答')
    expect(planReviewMessage('zh', '会话').title).toBe('需要你审阅计划')
    expect(planReviewMessage('en', 'demo').title).toBe('Plan review needed')
    expect(startMessage('zh', '会话').title).toBe('开始执行')
  })

  it('applies a custom title when set, keeps the built-in one otherwise', () => {
    const message = completionMessage('zh', '会话')
    expect(applyCustomTitle(message, '')).toBe(message)
    expect(applyCustomTitle(message, '  ')).toBe(message)
    const custom = applyCustomTitle(message, '【DSH】提醒')
    expect(custom.title).toBe('【DSH】提醒')
    expect(custom.body).toBe(message.body)
  })
})
