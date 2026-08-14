/**
 * Pure notification-copy builders shared by the host (ntfy) and the client
 * (browser system notifications + in-page toasts). No runtime imports.
 *
 * @module dsh-notify/messages
 */
import type { NotifyLanguage } from './config.ts';
/** One ready-to-show notification. */
export interface NotifyMessage {
    /** Short headline. */
    title: string;
    /** Body text (plain text — ntfy body / Notification body / toast line). */
    body: string;
    /** Comma-separated emoji tags (ntfy header). */
    tags: string;
}
/** Notification situation. */
export type NotifyKind = 'completion' | 'start' | 'approval' | 'approvalGeneric' | 'question' | 'planReview';
/**
 * Build one notification message.
 * @param language - copy language.
 * @param kind - situation.
 * @param values - placeholder values (`label`, `tool`, `reason`).
 * @returns the ready-to-show message.
 */
export declare function notifyMessage(language: NotifyLanguage, kind: NotifyKind, values?: Readonly<Record<string, string>>): NotifyMessage;
/**
 * Completion notification for one session.
 * @param language - copy language.
 * @param label - human-facing session label (title / project basename / id).
 */
export declare function completionMessage(language: NotifyLanguage, label: string): NotifyMessage;
/** Turn-start notification for one session. */
export declare function startMessage(language: NotifyLanguage, label: string): NotifyMessage;
/**
 * Approval notification. Uses the tool-specific copy when the tool name is
 * known, the generic copy otherwise; the reason is appended when present.
 * @param language - copy language.
 * @param label - human-facing session label.
 * @param toolName - tool requesting permission (optional).
 * @param reason - the asker's explanation (optional).
 */
export declare function approvalMessage(language: NotifyLanguage, label: string, toolName?: string, reason?: string): NotifyMessage;
/** Question notification for one session. */
export declare function questionMessage(language: NotifyLanguage, label: string): NotifyMessage;
/** Plan-review notification for one session. */
export declare function planReviewMessage(language: NotifyLanguage, label: string): NotifyMessage;
/**
 * Override a message's title with the user's custom title (when set).
 * @param message - the built notification.
 * @param customTitle - the user-configured title; empty keeps the built-in one.
 * @returns the message with the custom title applied, or unchanged.
 */
export declare function applyCustomTitle(message: NotifyMessage, customTitle: string): NotifyMessage;
