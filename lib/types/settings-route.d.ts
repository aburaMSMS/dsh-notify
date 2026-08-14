/**
 * The plugin's own settings bridge. rc.6's web settings boundary serves only
 * a hard-coded namespace allowlist (`WEB_SETTINGS_NAMESPACES` in
 * `dsh-host-apiproxy`), so a third-party namespace is never exposed to the
 * browser and every settings page would permanently report `unavailable`.
 * These two loopback routes are the plugin-owned workaround:
 *
 * - GET  /api/dsh-notify/settings — the live resolved config (the same
 *   settings-aware value the Host halves use);
 * - POST /api/dsh-notify/settings — one path-addressed edit
 *   `{ field: "ntfy.topic", value: "…" }`, applied through the Host settings
 *   provider's `mutate` (reachable Host-side; only the wire boundary is
 *   gated).
 *
 * The routes are loopback-fenced like the dsh-ssh API family: a LAN-exposed
 * dsh web deployment must not serve them.
 *
 * @module dsh-notify/settings-route
 */
import type { SettingsNamespace, SettingsProvider } from '@deepseek-ai/dsh-settings';
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver';
import type { NotifyConfig } from './config.ts';
/** Route path shared with the browser half. */
export declare const SETTINGS_API_PATH = "/api/dsh-notify/settings";
/** Dependencies the route handlers act through (tests inject fakes). */
export interface SettingsRouteDeps {
    /** Live resolved config reader. */
    getConfig: () => NotifyConfig;
    /** Host settings provider resolver (undefined in settings-less compositions). */
    settings: () => SettingsProvider | undefined;
    /** The plugin's settings namespace (branded). */
    namespace: SettingsNamespace;
}
/** Build the settings bridge route (one exact path, method-dispatched). */
export declare function makeSettingsRoutes(deps: SettingsRouteDeps): WebRoute[];
