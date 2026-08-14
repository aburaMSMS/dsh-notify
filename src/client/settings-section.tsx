/**
 * The dsh-notify settings section rendered inside the DSH settings panel.
 * The section registers through the `settings.section` / `settings.plugins.tab`
 * slots (declared by the settings shell) and reads/writes the plugin's
 * configuration through its own loopback bridge (the rc.6 web settings
 * boundary allowlists namespaces — see settings-route.ts), the same durable
 * store the Host half resolves its live config from, so every edit applies
 * immediately.
 *
 * The form is hand-rolled (plain controls + CSS module): the client bundle
 * must not carry schemastery, and the fields are a closed set.
 *
 * @module dsh-notify/client/settings-section
 */

import type { ReactNode } from 'react'
import { useSyncExternalStore } from 'react'
import type { NotifyConfig } from '../config.ts'
import { NOTIFY_DEFAULTS } from '../config.ts'
import type { NotifySettingsFace } from './settings-client.ts'
import css from './settings-section.module.css'

/** Props the settings page content receives. */
export interface NotifySettingsProps {
  /** The plugin's settings bridge client. */
  settings: NotifySettingsFace
}

/** The settings page content registered under the settings slots. */
export function NotifySettingsSection({ settings }: NotifySettingsProps): ReactNode {
  return <NotifyForm settings={settings} />
}

function NotifyForm({ settings }: { settings: NotifySettingsFace }): ReactNode {
  // Arrow wrappers keep the client's `this` (its methods are unbound class
  // methods, so passing the raw references through useSyncExternalStore
  // would run them against `undefined`).
  const snapshot = useSyncExternalStore(
    (listener) => settings.subscribe(listener),
    () => settings.getSnapshot(),
  )
  const value = snapshot.status === 'ready' && snapshot.value !== undefined ? snapshot.value : undefined
  const apply = (field: string, next: unknown): void => {
    void settings.set(field, next).catch((error: unknown) => {
      console.warn('[dsh-notify] settings write failed:', error)
    })
  }

  if (value === undefined) {
    return <div className={css.notice}>正在加载设置…（状态：{snapshot.status}）</div>
  }

  return (
    <div className={css.section} data-dsh-notify-settings="">
      <Group title="基础">
        <Row label="启用通知">
          <Checkbox checked={value.enabled} onChange={checked => { apply('enabled', checked) }} />
        </Row>
        <Row label="文案语言">
          <Select value={value.language} options={[['zh', '中文'], ['en', 'English']]} onChange={v => { apply('language', v) }} />
        </Row>
        <Row label="自定义标题" hint="留空使用内置标题（如「任务执行完毕」）">
          <TextInput value={value.customTitle} placeholder={NOTIFY_DEFAULTS.customTitle} onChange={v => { apply('customTitle', v) }} />
        </Row>
      </Group>

      <Group title="提醒时机">
        <Row label="任务开始执行">
          <Checkbox checked={value.onStart} onChange={checked => { apply('onStart', checked) }} />
        </Row>
        <Row label="任务执行完毕">
          <Checkbox checked={value.onCompletion} onChange={checked => { apply('onCompletion', checked) }} />
        </Row>
        <Row label="需要权限许可">
          <Checkbox checked={value.onApproval} onChange={checked => { apply('onApproval', checked) }} />
        </Row>
        <Row label="需要你回答 / 审阅">
          <Checkbox checked={value.onQuestion} onChange={checked => { apply('onQuestion', checked) }} />
        </Row>
      </Group>

      <Group title="Windows 原生通知" hint="主机直发，不经过浏览器权限；修改后即时生效">
        <Row label="启用原生通知">
          <Checkbox checked={value.desktopToast.enabled} onChange={checked => { apply('desktopToast.enabled', checked) }} />
        </Row>
        <Row label="应用名称" hint="通知头部显示的名称">
          <TextInput value={value.desktopToast.appName} placeholder={NOTIFY_DEFAULTS.desktopToast.appName} onChange={v => { apply('desktopToast.appName', v) }} />
        </Row>
        <Row label="自定义图标" hint="本地 PNG/ICO 绝对路径；留空使用内置 DeepSeek 鲸鱼标">
          <TextInput value={value.desktopToast.logoPath} placeholder="留空 = 内置 DeepSeek 鲸鱼标" onChange={v => { apply('desktopToast.logoPath', v) }} />
        </Row>
        <Row label="点击通知打开">
          <TextInput value={value.desktopToast.openUrl} placeholder={NOTIFY_DEFAULTS.desktopToast.openUrl} onChange={v => { apply('desktopToast.openUrl', v) }} />
        </Row>
        <Row label="PowerShell">
          <Select value={value.desktopToast.shell} options={[['powershell', 'powershell (5.1，推荐)'], ['pwsh', 'pwsh']]} onChange={v => { apply('desktopToast.shell', v) }} />
        </Row>
      </Group>

      <Group title="ntfy.sh 推送" hint="浏览器关闭 / 手机也能收到">
        <Row label="启用 ntfy">
          <Checkbox checked={value.ntfy.enabled} onChange={checked => { apply('ntfy.enabled', checked) }} />
        </Row>
        <Row label="服务器">
          <TextInput value={value.ntfy.server} placeholder={NOTIFY_DEFAULTS.ntfy.server} onChange={v => { apply('ntfy.server', v) }} />
        </Row>
        <Row label="主题 topic" hint="启用时必填；订阅同一主题的设备会收到">
          <TextInput value={value.ntfy.topic} placeholder="my-topic" onChange={v => { apply('ntfy.topic', v) }} />
        </Row>
        <Row label="访问令牌" hint="受保护主题的令牌（可选，加密存储）">
          <TextInput type="password" value={value.ntfy.token} placeholder="（未设置）" onChange={v => { apply('ntfy.token', v) }} />
        </Row>
        <Row label="优先级">
          <Select value={value.ntfy.priority} options={[['min', 'min'], ['low', 'low'], ['default', 'default'], ['high', 'high'], ['max', 'max']]} onChange={v => { apply('ntfy.priority', v) }} />
        </Row>
        <Row label="标签 tags" hint="emoji 标签，逗号分隔">
          <TextInput value={value.ntfy.tags} placeholder={NOTIFY_DEFAULTS.ntfy.tags} onChange={v => { apply('ntfy.tags', v) }} />
        </Row>
        <Row label="点击打开 URL">
          <TextInput value={value.ntfy.clickUrl} placeholder="（可选）" onChange={v => { apply('ntfy.clickUrl', v) }} />
        </Row>
      </Group>
    </div>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }): ReactNode {
  return (
    <section className={css.group}>
      <h3 className={css.groupTitle}>{title}</h3>
      {hint !== undefined && <p className={css.groupHint}>{hint}</p>}
      {children}
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }): ReactNode {
  return (
    <label className={css.row}>
      <span className={css.rowLabel}>
        {label}
        {hint !== undefined && <span className={css.rowHint}>{hint}</span>}
      </span>
      <span className={css.rowControl}>{children}</span>
    </label>
  )
}

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }): ReactNode {
  return <input type="checkbox" className={css.checkbox} checked={checked} onChange={event => { onChange(event.target.checked) }} />
}

function TextInput({ value, placeholder, type = 'text', onChange }: {
  value: string
  placeholder?: string
  type?: 'text' | 'password'
  onChange: (value: string) => void
}): ReactNode {
  return <input type={type} className={css.text} value={value} placeholder={placeholder} onChange={event => { onChange(event.target.value) }} />
}

function Select({ value, options, onChange }: {
  value: string
  options: ReadonlyArray<readonly [string, string]>
  onChange: (value: string) => void
}): ReactNode {
  return (
    <select className={css.select} value={value} onChange={event => { onChange(event.target.value) }}>
      {options.map(([optionValue, label]) => (
        <option key={optionValue} value={optionValue}>{label}</option>
      ))}
    </select>
  )
}
