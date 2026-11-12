import type { CreditBalance, ProviderUsage } from './SubscriptionsSection.js';
import type { SubscriptionsKey } from './locales.js';
import type { QuotaDisplayMode } from './usage-badge-preferences.js';
type Translate = (key: SubscriptionsKey, params?: Record<string, unknown>) => string;
/** Never coerce null, missing or non-finite telemetry into a full allowance. */
export declare function quotaPercent(used: unknown, mode: QuotaDisplayMode): number | undefined;
/** Group a reported credit balance without inventing a currency conversion. */
export declare function formatCreditBalance(value: string): string;
/** Display line for a disclosed Codex credit balance; undefined when absent. */
export declare function creditBalanceText(credits: CreditBalance | undefined, t: Translate): string | undefined;
export declare function quotaText(used: unknown, mode: QuotaDisplayMode, t: Translate): string;
export declare function quotaIsStale(usage: ProviderUsage, now?: number): boolean;
/** Ticks only the local presentation clock; never fetches usage. */
export declare function useQuotaClock(): number;
/** Availability is separate from the age of an existing quota snapshot. */
export declare function quotaUnavailableText(usage: ProviderUsage | undefined, failed: boolean, t: Translate): string | undefined;
/** Receipt time is diagnostic only: a successful RPC can still return an old cache. */
export declare function usageFreshnessText(usage: ProviderUsage | undefined, failed: boolean, t: Translate, now?: number): string;
export declare function UsageFreshness({ usage, failed, t }: {
    usage: ProviderUsage | undefined;
    failed?: boolean;
    t: Translate;
}): import("react").JSX.Element;
export {};
