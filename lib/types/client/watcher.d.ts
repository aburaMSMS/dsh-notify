/**
 * Client-side session watcher: subscribes to `ctx.sessions.list` and diffs
 * session rows into notification events. The diff core is pure (no DOM, no
 * services) so tests drive it without a browser; `mountWatcher` is the only
 * side-effecting part.
 *
 * Event semantics:
 * - completion: the runtime's `completed` flag flips (session finished while
 *   not selected), or the CURRENT session stops running while the page is
 *   hidden/unfocused — the case the `completed` flag cannot express.
 * - start: a session starts running (gated by config; default off).
 * - approval / question / planReview: the session's blocking pending
 *   interaction appears or changes kind.
 *
 * @module dsh-notify/client/watcher
 */
import type { ISessions, PendingInteractionStatus, SessionListState } from '@deepseek-ai/dsh-client-runtime/client';
import type { NotifyConfig } from '../config.ts';
/** Notification situations produced by the watcher. */
export type NotifyEventKind = 'completion' | 'start' | 'approval' | 'question' | 'planReview';
/** One notification event derived from a session-list diff. */
export interface NotifyEvent {
    kind: NotifyEventKind;
    sessionId: string;
    /** Human-facing session label (display title). */
    label: string;
}
/** Normalized per-session row the diff operates on. */
export interface WatchedRow {
    id: string;
    label: string;
    running: boolean;
    pending: PendingInteractionStatus | undefined;
    completed: boolean;
    current: boolean;
}
/**
 * Project a session-list snapshot into normalized rows (only ids-listed
 * sessions; breadcrumb-only entries stay out of notifications).
 * @param snapshot - the current `SessionListState`.
 * @returns rows in list order.
 */
export declare function rowsOf(snapshot: SessionListState): WatchedRow[];
/**
 * Diff the previous rows against the current ones.
 * @param prev - previous normalized rows keyed by session id.
 * @param rows - current normalized rows.
 * @param pageActive - whether the page is visible AND focused (suppresses the
 *   completion notification for the current session the user is watching).
 * @param onStart - whether start notifications are enabled.
 * @param includeNew - whether rows never seen before produce events. The
 *   initial baseline keeps this false (reloads stay silent); after the first
 *   snapshot, true makes sessions created later notify on arrival.
 * @returns events in list order.
 */
export declare function diffSessions(prev: ReadonlyMap<string, WatchedRow>, rows: readonly WatchedRow[], pageActive: boolean, onStart: boolean, includeNew?: boolean): NotifyEvent[];
/**
 * Subscribe to the sessions list and forward diffs as notification events.
 * @param sessions - the client sessions service (resolved by the caller; the
 *   Context-merged `sessions` property conflicts with the host `dsh-session`
 *   merge in a single-program build, so this module takes the service value
 *   directly instead of a Context).
 * @param getConfig - reader for the CURRENT plugin config (gates `onStart`;
 *   other gates apply at the dispatch site). Read per diff so live settings
 *   changes take effect without re-mounting.
 * @param onEvent - event consumer (synchronous; must not throw).
 * @returns disposer unsubscribing the store.
 */
export declare function mountWatcher(sessions: ISessions, getConfig: () => NotifyConfig, onEvent: (event: NotifyEvent) => void): () => void;
