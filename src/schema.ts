/**
 * schemastery config schema for the dsh-notify row. Host-only: the browser
 * half consumes the same config object through `withDefaults` and never
 * needs the schema (keeping schemastery out of the client bundle).
 *
 * Field descriptions and the secret role feed the settings surface: the
 * generic settings UI renders labels/hints from descriptions and redacts
 * `role('secret')` fields on the wire.
 *
 * @module dsh-notify/schema
 */

import z from 'schemastery'
import type { NotifyConfig } from './config.ts'

/** Loader-facing config schema; defaults mirror `NOTIFY_DEFAULTS`. */
export const NotifyConfigSchema: z<NotifyConfig> = z.object({
  enabled: z.boolean().default(true).description('总开关：关闭后停止所有通知'),
  language: z.union(['zh', 'en']).default('zh').description('通知文案语言'),
  customTitle: z.string().default('').description('自定义通知标题（留空使用内置标题，如「任务执行完毕」）'),
  onStart: z.boolean().default(false).description('任务开始执行时提醒'),
  onCompletion: z.boolean().default(true).description('任务执行完毕时提醒'),
  onApproval: z.boolean().default(true).description('工具请求权限许可时提醒'),
  onQuestion: z.boolean().default(true).description('Agent 需要你回答/审阅时提醒'),
  ntfy: z.object({
    enabled: z.boolean().default(false).description('启用 ntfy 推送（浏览器关闭/手机也能收到）'),
    server: z.string().default('https://ntfy.sh').description('ntfy 服务器地址（可自建）'),
    topic: z.string().default('').description('推送主题；订阅同一主题的设备会收到（启用时必填）'),
    token: z.string().role('secret').default('').description('受保护主题的访问令牌（可选）'),
    priority: z.union(['min', 'low', 'default', 'high', 'max']).default('default').description('通知优先级'),
    tags: z.string().default('robot').description('通知上的 emoji 标签（逗号分隔；内置场景标签优先，此值作为无标签消息的兜底）'),
    clickUrl: z.string().default('').description('点击 ntfy 通知打开的 URL（可选）'),
  }).description('ntfy.sh 推送通道'),
  desktopToast: z.object({
    enabled: z.boolean().default(false).description('启用 Windows 原生通知（无需浏览器权限）'),
    shell: z.union(['pwsh', 'powershell']).default('powershell').description('PowerShell 可执行文件（默认 powershell，5.1 最稳）'),
    timeoutMs: z.number().default(10_000).description('通知进程超时（毫秒）'),
    appId: z.string().default('Dsh.Notify').description('Windows 通知身份 ID（一般无需修改）'),
    appName: z.string().default('DSH Notify').description('通知头部显示的应用名称'),
    logoPath: z.string().default('').description('自定义通知图标（本地 PNG/ICO 绝对路径；留空使用内置 DeepSeek 鲸鱼标）'),
    openUrl: z.string().default('http://127.0.0.1:3080').description('点击通知打开的页面'),
  }).description('Windows 原生通知通道'),
})
