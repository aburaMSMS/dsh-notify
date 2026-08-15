/**
 * Page-presence heartbeat for the browser half. The Host routes desktop
 * toasts to the in-page toast stack while the DSH page is visible AND
 * focused; when the page disappears (tab hidden, window minimized, browser
 * closed) the Host falls back to Windows native toasts after the heartbeat
 * lease expires.
 *
 * Presence is a short lease, not a sticky flag: the Host expires it if the
 * heartbeat stops, so a crashed/killed browser never leaves desktop toasts
 * permanently silenced. Every transition also sends an immediate update, so
 * hiding the page takes effect at the next notification instead of waiting
 * for the lease.
 *
 * @module dsh-notify/client/presence
 */
/** Heartbeat cadence; the Host lease is a small multiple of this. */
export declare const PRESENCE_HEARTBEAT_MS = 5000;
/** The page facts presence is derived from. */
export interface PresencePage {
    visibilityState: string;
    hasFocus(): boolean;
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
}
/** Event + timer host (a DOM `window`/`document` pair in production). */
export interface PresenceHost {
    addEventListener(type: string, listener: () => void): void;
    removeEventListener(type: string, listener: () => void): void;
    setInterval(handler: () => void, timeout?: number): number;
    clearInterval(id?: number): void;
}
/** Whether the user is actively on the DSH page (visible AND focused). */
export declare function isPageActive(page: PresencePage): boolean;
/**
 * Run one presence reporter: immediate report, transition reports, and a
 * regular refresh heartbeat. The disposer reports `false` so the Host
 * re-arms desktop toasts without waiting for the lease.
 * @param page - document-like page (visibility + focus).
 * @param host - window-like event/timer host.
 * @param report - transport for `{ active: boolean }` updates.
 * @param heartbeatMs - heartbeat cadence.
 * @returns disposer (also reports `false`).
 */
export declare function createPresenceReporter(page: PresencePage, host: PresenceHost, report: (active: boolean) => void, heartbeatMs?: number): () => void;
/**
 * Mount the production presence reporter. The heartbeat fetch is
 * fire-and-forget; failures warn once (the page may predate the Host route
 * after a rolling upgrade) and recover silently.
 */
export declare function mountPresence(): () => void;
