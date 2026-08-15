/**
 * schemastery config schema for the dsh-notify row. Host-only: the browser
 * half consumes the same config object through `withDefaults` and never
 * needs the schema (keeping schemastery out of the client bundle).
 *
 * Field descriptions and the secret role feed the settings surface: the
 * generic settings UI renders labels/hints from descriptions and redacts
 * `role('secret')` fields on the wire.
 *
 * @module dsh-notify/schema
 */
import z from '@deepseek-ai/schemastery';
import type { NotifyConfig } from './config.ts';
/** Loader-facing config schema; defaults mirror `NOTIFY_DEFAULTS`. */
export declare const NotifyConfigSchema: z<NotifyConfig>;
