/**
 * ntfy.sh publish helpers: pure request construction plus an injectable
 * fetch-based publisher. The host half calls `publishNtfy` fire-and-forget;
 * the fetch implementation is a parameter so tests can drive failures
 * without a network.
 *
 * @module dsh-notify/ntfy
 */
import type { NtfyConfig } from './config.ts';
import type { NotifyMessage } from './messages.ts';
/** ntfy topic publish endpoint (trailing slashes stripped, topic encoded). */
export declare function ntfyUrl(server: string, topic: string): string;
/** A ready-to-send ntfy publish request. */
export interface NtfyPublishRequest {
    url: string;
    init: RequestInit;
}
/**
 * Build the ntfy publish request for one message.
 * @param ntfy - resolved ntfy settings.
 * @param message - the notification to publish.
 * @returns URL and fetch init (headers carry Title/Priority/Tags and the
 *   optional Authorization and Click headers).
 */
export declare function ntfyRequest(ntfy: NtfyConfig, message: NotifyMessage): NtfyPublishRequest;
/**
 * Publish one message to the configured ntfy topic.
 * @param ntfy - resolved ntfy settings (enabled + non-empty topic assumed).
 * @param message - the notification to publish.
 * @param fetchImpl - fetch implementation (injected for tests).
 * @throws when the transport fails or the server answers non-2xx.
 */
export declare function publishNtfy(ntfy: NtfyConfig, message: NotifyMessage, fetchImpl?: typeof fetch): Promise<void>;
