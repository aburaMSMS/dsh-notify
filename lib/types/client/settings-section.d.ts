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
import type { ReactNode } from 'react';
import type { NotifySettingsFace } from './settings-client.ts';
/** Props the settings page content receives. */
export interface NotifySettingsProps {
    /** The plugin's settings bridge client. */
    settings: NotifySettingsFace;
}
/** The settings page content registered under the settings slots. */
export declare function NotifySettingsSection({ settings }: NotifySettingsProps): ReactNode;
