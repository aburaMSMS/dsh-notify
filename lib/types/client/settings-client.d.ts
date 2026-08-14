/**
 * Browser-side settings client: a fetch-based stand-in for the settings
 * namespace transport. rc.6's web settings boundary serves only a
 * hard-coded namespace allowlist (see settings-route.ts), so the plugin
 * reads and writes its configuration through its own loopback API instead
 * of `ctx.settingsScope`.
 *
 * The public face (subscribe/getSnapshot/set) matches the settings-scope
 * shape so the settings form needs no knowledge of the transport.
 *
 * @module dsh-notify/client/settings-client
 */
import type { NotifyConfig } from '../config.ts';
/** Sync snapshot of the plugin's settings, mirroring the scope shape. */
export interface NotifySettingsSnapshot {
    status: 'loading' | 'ready' | 'unavailable';
    value: NotifyConfig | undefined;
}
/** Minimal face the settings form consumes. */
export interface NotifySettingsFace {
    subscribe: (listener: () => void) => () => void;
    getSnapshot: () => NotifySettingsSnapshot;
    set: (field: string, value: unknown) => Promise<void>;
}
/** Fetch-based settings client (one per page load). */
export declare class NotifySettingsClient implements NotifySettingsFace {
    private snapshot;
    private readonly listeners;
    readonly subscribe: (listener: () => void) => (() => void);
    readonly getSnapshot: () => NotifySettingsSnapshot;
    /** Pull the live resolved config from the host bridge. */
    load(): Promise<void>;
    /** Apply one field edit through the host bridge, then refresh. */
    set(field: string, value: unknown): Promise<void>;
    private accept;
}
