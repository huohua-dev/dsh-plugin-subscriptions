import type { SubscriptionsKey } from './locales.js';
import { type UsageWindow } from './SubscriptionsSection.js';
import { type QuotaDisplayMode } from './usage-badge-preferences.js';
type Translate = (key: SubscriptionsKey, params?: Record<string, unknown>) => string;
/** Provider-defined shared limits, unified with the global used/remaining quota display mode. */
export declare function AntigravityQuotaSummary({ windows, t, mode }: {
    windows: readonly UsageWindow[];
    t: Translate;
    mode?: QuotaDisplayMode | undefined;
}): import("react").JSX.Element;
export {};
