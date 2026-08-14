/**
 * In-page toast stack: a body-level React root (the shell never manages
 * `document.body` children, so the container survives shell re-renders) with
 * a tiny publish/subscribe store. Toasts auto-dismiss, keep at most five
 * items, and open the owning session when clicked.
 *
 * Browser OS notifications were removed from this plugin — the Windows
 * native toast channel (host-raised) covers the OS layer, and these toasts
 * cover the in-page surface while the GUI is visible.
 *
 * @module dsh-notify/client/toast
 */
/** One toast item. */
export interface ToastItem {
    id: number;
    title: string;
    body: string;
    /** Owning session; clicking the toast opens it. */
    sessionId?: string;
    /** Auto-dismiss delay in ms; default {@link AUTO_DISMISS_MS}. */
    durationMs?: number;
}
/** Tiny useSyncExternalStore-compatible toast store. */
declare class ToastStore {
    private items;
    private readonly listeners;
    readonly subscribe: (listener: () => void) => (() => void);
    readonly getSnapshot: () => readonly ToastItem[];
    /** Append one toast (dropping the oldest beyond the cap) and notify. */
    push(item: ToastItem): void;
    /** Remove one toast and notify. */
    dismiss(id: number): void;
    private emit;
}
/** The shared store (a plugin-owned singleton for the page lifetime). */
export declare const toastStore: ToastStore;
/**
 * Mount the toast stack on document.body.
 * @param onOpenSession - opens a session by id (toast click).
 * @returns disposer unmounting the React root and removing the container.
 */
export declare function mountToasts(onOpenSession: (sessionId: string) => void): () => void;
export {};
