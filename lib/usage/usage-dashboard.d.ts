/**
 * Pure cross-provider & cross-account usage dashboard aggregator.
 *
 * Aggregates deduplicated UTC daily token counts across tracked providers and
 * accounts without double-counting overlapping quota windows (e.g. a request
 * counted in both `5h` and `weekly`, or `weekly` + `weekly (scope: opus)`).
 *
 * Deduplication rule per `(provider, account, day, model)`:
 * - Within one `(kind, scope)` series, entries are sequential windows; summing
 *   all `id`-deduplicated visible entries in that series gives that series'
 *   total for `(day, model)`.
 * - Across overlapping series of the same `(provider, account)`, every
 *   applicable series observed the same underlying request stream. We pick one
 *   canonical series per `(provider, account, day, model)` (highest total
 *   tokens, preferring unscoped `weekly > 5h > monthly > pending` on ties), so
 *   overlapping 5h + weekly windows never double-count, while disjoint
 *   model-family scopes (e.g. Antigravity's Gemini vs Claude pools) each
 *   contribute their own models without loss.
 */
import { type TrackedProvider } from './constants.js';
import type { PreTrackingStatus } from './pre-tracking.js';
import { type StoredSummary } from './service.js';
import type { LoggedInAccount } from './usage-rpc.js';
import type { ObservedWindow, WindowUsageEntry } from './window-tracker.js';
import { type ViewKind, type ViewMarker } from './window-view.js';
export declare const DASHBOARD_RANGES: readonly ["7d", "30d", "90d", "all"];
export type DashboardRange = typeof DASHBOARD_RANGES[number];
export interface UsageDashboardPayload {
    /** Provider filter; omitted or 'all' aggregates all tracked providers. */
    provider?: TrackedProvider | 'all';
    /** Account filter; omitted or 'all' aggregates all accounts. */
    account?: string | 'all';
    /** Time range for KPI summary, daily trend, models, and providerBreakdown; defaults to '30d'. */
    range?: DashboardRange;
}
export interface TokenTotals {
    /** inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens (reasoningTokens is a subset of outputTokens). */
    totalTokens: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
}
export interface DashboardProviderAccount {
    key: string;
    /** Display identity (email / login) when logged in; omitted for logged-out historical accounts. */
    label?: string;
    loggedIn: boolean;
    isDefault: boolean;
    /** Deduplicated total tokens for this account across all stored dated history. */
    totalTokens: number;
}
export interface DashboardProviderInfo {
    provider: TrackedProvider;
    /** Deduplicated total tokens for this provider in the selected range. */
    totalTokens: number;
    accounts: DashboardProviderAccount[];
    clearedAt?: number;
}
export interface DashboardSummary extends TokenTotals {
    activeModels: number;
    activeDays: number;
    activeAccounts: number;
}
export interface DashboardDailyModelEntry extends TokenTotals {
    provider: TrackedProvider;
    model: string;
}
export interface DashboardDailyBucket extends TokenTotals {
    /** UTC date 'YYYY-MM-DD'. */
    date: string;
    byProvider: Partial<Record<TrackedProvider, number>>;
    byModel: DashboardDailyModelEntry[];
}
export interface DashboardModelSummary extends TokenTotals {
    provider: TrackedProvider;
    model: string;
    share: number;
}
export interface DashboardProviderBreakdown extends TokenTotals {
    provider: TrackedProvider;
    share: number;
    activeModels: number;
    activeAccounts: number;
}
export interface DashboardActiveWindowModel extends TokenTotals {
    model: string;
    /** Share of this cycle's totalTokens in [0, 1]. */
    share: number;
}
export type DashboardCycleModel = DashboardActiveWindowModel;
export interface DashboardActiveWindow extends TokenTotals {
    /** Stable unique key for React lists (`${provider}:${account}:${kind}:${scope ?? ''}:${countedFrom}`). */
    id: string;
    provider: TrackedProvider;
    account: string;
    accountLabel?: string;
    loggedIn: boolean;
    kind: ViewKind;
    scope?: string;
    window0: boolean;
    /** True for currently open/active cycles (`status === 'open'`); false for recent closed/ended-early historical cycles. */
    isCurrent: boolean;
    startsAt?: number;
    countedFrom: number;
    endsAt?: number;
    resetAt?: number;
    status: 'open' | 'closed' | 'ended-early';
    /** Latest observed provider quota utilization for this cycle (0–100), omitted when never observed. */
    quotaUsedPercent?: number;
    /** Peak observed provider quota utilization during this cycle (0–100), omitted when never observed. */
    quotaPeakPercent?: number;
    markers: ViewMarker[];
    models: DashboardActiveWindowModel[];
}
export type DashboardQuotaCycle = DashboardActiveWindow;
export interface DashboardClearInfo extends StoredSummary {
    provider: TrackedProvider;
    clearedAt?: number;
}
export interface UsageDashboardResponse {
    generatedAt: number;
    range: DashboardRange;
    filters: {
        provider: TrackedProvider | 'all';
        account: string | 'all';
    };
    providers: DashboardProviderInfo[];
    summary: DashboardSummary;
    daily: DashboardDailyBucket[];
    heatmap: DashboardDailyBucket[];
    models: DashboardModelSummary[];
    providerBreakdown: DashboardProviderBreakdown[];
    activeWindows: DashboardActiveWindow[];
    /** Current open cycles first, followed by recent closed/ended-early cycles newest-first (capped at 40). */
    quotaCycles: DashboardActiveWindow[];
    clearInfo: Record<TrackedProvider, DashboardClearInfo>;
    cleared: boolean;
    trackingStartedAt: number;
    errors: string[];
}
export interface ProviderDashboardInput {
    provider: TrackedProvider;
    entries: readonly WindowUsageEntry[];
    loggedIn: readonly LoggedInAccount[];
    observed: (account: string) => readonly ObservedWindow[];
    clearedAt?: number;
    preTracking: PreTrackingStatus;
    errors: readonly string[];
}
export interface DashboardBuildInput {
    now: number;
    trackingStartedAt: number;
    providers: readonly ProviderDashboardInput[];
}
/** Build the complete Usage Dashboard response from loaded provider snapshots. */
export declare function buildUsageDashboard(input: DashboardBuildInput, query?: UsageDashboardPayload): UsageDashboardResponse;
