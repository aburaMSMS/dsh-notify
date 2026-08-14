/**
 * Pure notification-copy builders shared by the host (ntfy) and the client
 * (browser system notifications + in-page toasts). No runtime imports.
 *
 * @module dsh-notify/messages
 */

import type { NotifyLanguage } from './config.ts'

/** One ready-to-show notification. */
export interface NotifyMessage {
  /** Short headline. */
  title: string
  /** Body text (plain text — ntfy body / Notification body / toast line). */
  body: string
  /** Comma-separated emoji tags (ntfy header). */
  tags: string
}

/** Notification situation. */
export type NotifyKind = 'completion' | 'start' | 'approval' | 'approvalGeneric' | 'question' | 'planReview'

interface CopyEntry {
  title: string
  body: string
  tags: string
}

const COPY: Record<NotifyLanguage, Record<NotifyKind, CopyEntry>> = {
  zh: {
    completion: { title: '任务执行完毕', body: '「{label}」已执行完毕，需要你查看', tags: 'white_check_mark' },
    start: { title: '开始执行', body: '「{label}」开始执行任务', tags: 'rocket' },
    approval: { title: '需要权限许可', body: '「{label}」中，工具 {tool} 请求许可{reason}', tags: 'lock' },
    approvalGeneric: { title: '需要权限许可', body: '「{label}」中有工具请求许可{reason}', tags: 'lock' },
    question: { title: '需要你回答', body: '「{label}」中，Agent 需要你回答问题', tags: 'question' },
    planReview: { title: '需要你审阅计划', body: '「{label}」中，Agent 提交了计划等待审阅', tags: 'clipboard' },
  },
  en: {
    completion: { title: 'Task finished', body: '"{label}" has finished and needs your attention', tags: 'white_check_mark' },
    start: { title: 'Task started', body: '"{label}" started running', tags: 'rocket' },
    approval: { title: 'Permission required', body: 'Tool {tool} in "{label}" requests permission{reason}', tags: 'lock' },
    approvalGeneric: { title: 'Permission required', body: 'A tool in "{label}" requests permission{reason}', tags: 'lock' },
    question: { title: 'Question for you', body: '"{label}" needs your answer', tags: 'question' },
    planReview: { title: 'Plan review needed', body: '"{label}" submitted a plan for review', tags: 'clipboard' },
  },
}

/** Keep very long approval reasons readable on a notification. */
const REASON_LIMIT = 140

/** Replace `{key}` placeholders; unknown keys stay verbatim. */
function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/gu, (match, key: string) => values[key] ?? match)
}

/**
 * Build one notification message.
 * @param language - copy language.
 * @param kind - situation.
 * @param values - placeholder values (`label`, `tool`, `reason`).
 * @returns the ready-to-show message.
 */
export function notifyMessage(language: NotifyLanguage, kind: NotifyKind, values: Readonly<Record<string, string>> = {}): NotifyMessage {
  const entry = COPY[language][kind]
  return { title: entry.title, body: fill(entry.body, values), tags: entry.tags }
}

/** Clamp an approval reason to a notification-friendly length. */
function clampReason(reason: string): string {
  if (reason.length <= REASON_LIMIT) return reason
  return `${reason.slice(0, REASON_LIMIT)}…`
}

/**
 * Completion notification for one session.
 * @param language - copy language.
 * @param label - human-facing session label (title / project basename / id).
 */
export function completionMessage(language: NotifyLanguage, label: string): NotifyMessage {
  return notifyMessage(language, 'completion', { label })
}

/** Turn-start notification for one session. */
export function startMessage(language: NotifyLanguage, label: string): NotifyMessage {
  return notifyMessage(language, 'start', { label })
}

/**
 * Approval notification. Uses the tool-specific copy when the tool name is
 * known, the generic copy otherwise; the reason is appended when present.
 * @param language - copy language.
 * @param label - human-facing session label.
 * @param toolName - tool requesting permission (optional).
 * @param reason - the asker's explanation (optional).
 */
export function approvalMessage(language: NotifyLanguage, label: string, toolName?: string, reason?: string): NotifyMessage {
  const reasonPart = reason !== undefined && reason.trim() !== '' ? `${language === 'zh' ? '：' : ': '}${clampReason(reason.trim())}` : ''
  return toolName !== undefined && toolName !== ''
    ? notifyMessage(language, 'approval', { label, tool: toolName, reason: reasonPart })
    : notifyMessage(language, 'approvalGeneric', { label, reason: reasonPart })
}

/** Question notification for one session. */
export function questionMessage(language: NotifyLanguage, label: string): NotifyMessage {
  return notifyMessage(language, 'question', { label })
}

/** Plan-review notification for one session. */
export function planReviewMessage(language: NotifyLanguage, label: string): NotifyMessage {
  return notifyMessage(language, 'planReview', { label })
}

/**
 * Override a message's title with the user's custom title (when set).
 * @param message - the built notification.
 * @param customTitle - the user-configured title; empty keeps the built-in one.
 * @returns the message with the custom title applied, or unchanged.
 */
export function applyCustomTitle(message: NotifyMessage, customTitle: string): NotifyMessage {
  return customTitle.trim() === '' ? message : { ...message, title: customTitle.trim() }
}
