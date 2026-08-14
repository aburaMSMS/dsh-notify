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

import type { ReactNode, KeyboardEvent } from 'react'
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import css from './toast.module.css'

/** One toast item. */
export interface ToastItem {
  id: number
  title: string
  body: string
  /** Owning session; clicking the toast opens it. */
  sessionId?: string
  /** Auto-dismiss delay in ms; default {@link AUTO_DISMISS_MS}. */
  durationMs?: number
}

const MAX_TOASTS = 5
const AUTO_DISMISS_MS = 8000

/** Tiny useSyncExternalStore-compatible toast store. */
class ToastStore {
  private items: readonly ToastItem[] = []
  private readonly listeners = new Set<() => void>()

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  readonly getSnapshot = (): readonly ToastItem[] => this.items

  /** Append one toast (dropping the oldest beyond the cap) and notify. */
  push(item: ToastItem): void {
    this.items = [...this.items, item].slice(-MAX_TOASTS)
    this.emit()
  }

  /** Remove one toast and notify. */
  dismiss(id: number): void {
    this.items = this.items.filter(item => item.id !== id)
    this.emit()
  }

  private emit(): void {
    for (const listener of this.listeners) listener()
  }
}

/** The shared store (a plugin-owned singleton for the page lifetime). */
export const toastStore = new ToastStore()

/**
 * Mount the toast stack on document.body.
 * @param onOpenSession - opens a session by id (toast click).
 * @returns disposer unmounting the React root and removing the container.
 */
export function mountToasts(onOpenSession: (sessionId: string) => void): () => void {
  const container = document.createElement('div')
  container.dataset.dshNotifyToasts = ''
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  root.render(
    <div className={css.host}>
      <ToastStack store={toastStore} onOpenSession={onOpenSession} />
    </div>,
  )
  return () => {
    root.unmount()
    container.remove()
  }
}

function ToastStack({ store, onOpenSession }: {
  store: ToastStore
  onOpenSession: (sessionId: string) => void
}): ReactNode {
  const items = useSyncExternalStore(store.subscribe, store.getSnapshot)
  return (
    <div className={css.stack} role="status" aria-live="polite">
      {items.map(item => (
        <Toast
          key={item.id}
          item={item}
          onDismiss={() => { store.dismiss(item.id) }}
          onOpenSession={onOpenSession}
        />
      ))}
    </div>
  )
}

function Toast({ item, onDismiss, onOpenSession }: {
  item: ToastItem
  onDismiss: () => void
  onOpenSession: (sessionId: string) => void
}): ReactNode {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, item.durationMs ?? AUTO_DISMISS_MS)
    return () => { window.clearTimeout(timer) }
  }, [onDismiss, item.id, item.durationMs])

  const open = useCallback(() => {
    if (item.sessionId !== undefined) onOpenSession(item.sessionId)
    onDismiss()
  }, [item.sessionId, onOpenSession, onDismiss])

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }, [open])

  return (
    <div
      className={css.toast}
      data-dsh-notify-toast=""
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={handleKeyDown}
    >
      <div className={css.title}>{item.title}</div>
      <div className={css.body}>{item.body}</div>
    </div>
  )
}
