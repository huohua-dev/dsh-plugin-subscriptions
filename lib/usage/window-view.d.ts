/**
 * The Usage view model: one account's stored window
 * entries presented as navigable windows, one at a time. Pure: the caller
 * passes the entries, what the latest snapshot reported, the live quota
 * and the tracked token totals.
 *
 * Presentation only: merging and de-duplication never rewrite a
 * stored entry. Every user-facing text is a marker id or an `empty` id; the
 * client owns the words.
 */
import { type TrackedProvider } from './constants.js';
import type { PreTrackingStatus } from './pre-tracking.js';
import { type DaySums, type ModelSums } from './usage-schema.js';
import type { ObservedWindow, WindowKind, WindowUsageEntry } from './window-tracker.js';
export type ViewKind = Exclude<WindowKind, 'unclassified'> | 'pending';
export interface KindOption {
    kind: ViewKind;
    scope?: string;
}
/** Marker ids, in display order. There is no "estimated" marker and no rolling period. */
export declare const VIEW_MARKERS: readonly ["window0-tracking-start", "window0-cleared", "window0-pending", "since-first-observed", "since-tracking", "since-cleared", "ended-early", "ended-early-later-usage", "reset-not-reported", "boundaries-unknown"];
export type ViewMarker = typeof VIEW_MARKERS[number];
export interface ViewWindow {
    kind: ViewKind;
    scope?: string;
    window0: boolean;
    /** Absent on Window 0. */
    startsAt?: number;
    countedFrom: number;
    /** `endedAt ?? resetsAt`; absent when neither is known (an open Window 0, boundaries not known yet). */
    end?: number;
    resetsAt?: number;
    status: WindowUsageEntry['status'];
    /** The newest window of its kind and scope. */
    current: boolean;
    oldest: boolean;
    /** Latest observed provider quota utilization for this window (0–100), when reported. */
    quotaUsedPercent?: number;
    /** Peak observed provider quota utilization during this window (0–100), when reported. */
    quotaPeakPercent?: number;
    markers: ViewMarker[];
    models: ModelSums;
    /** UTC day -> per-model totals inside this window only. */
    days: DaySums;
    /** The stored entries shown as this window; more than one when merged. */
    entryIds: string[];
}
export type ProviderTotalView = {
    state: 'stored';
    models: ModelSums;
} | {
    state: 'cleared' | 'not-computed' | 'unavailable';
};
export interface ViewInput {
    provider: TrackedProvider;
    account: string;
    /** Every stored entry of the provider: any account, open and closed, possibly one id twice. */
    entries: readonly WindowUsageEntry[];
    /** What the account's latest snapshot reported; `[]` before its first snapshot or when unknown. */
    observed: readonly ObservedWindow[];
    trackingStartedAt: number;
    clearedAt?: number;
    preTracking: PreTrackingStatus;
}
export interface ViewQuery {
    kind?: ViewKind;
    scope?: string;
    /** "The window containing this instant". Omitted: the current window. */
    at?: number;
}
export interface UsageView {
    provider: TrackedProvider;
    account: string;
    kinds: KindOption[];
    selected?: KindOption;
    /** Absent: "no window". */
    window?: ViewWindow;
    /** `countedFrom` of the nearest older window; absent at the oldest. */
    previousAt?: number;
    /** `countedFrom` of the nearest newer window; absent at the current one. */
    nextAt?: number;
    /** Set only when the account has no visible window in any kind. */
    empty?: 'no-usage' | 'cleared' | 'not-observed';
    clearedAt?: number;
    trackingStartedAt: number;
    /** The before-tracking block, independent of the selected window. */
    providerTotal: ProviderTotalView;
}
/** Every view kind, in selector order; a pending Window 0 is listed last ("Not observed yet"). */
export declare const VIEW_KINDS: readonly ViewKind[];
/**
 * Build the view of one account for one query: the kinds it can
 * show, the selected window with markers and token totals, and the navigation
 * facts. Without a query it is the default view: the current window of the
 * first kind that has one.
 */
export declare function buildUsageView(input: ViewInput, query?: ViewQuery): UsageView;
/**
 * The newest merged window for every reported or stored (kind, scope) of one
 * account, in selector order. Reuses the same dedup, merge and marker rules as
 * {@link buildUsageView} without scanning once per kind.
 */
export declare function currentWindowsOf(input: ViewInput): ViewWindow[];
/**
 * Every merged window (current and historical) for every reported or stored
 * (kind, scope) of one account. Reuses {@link windowsOf} and {@link presentWindow}
 * so each returned cycle has exact deduped totals, markers, and quota %.
 */
export declare function allWindowsOf(input: ViewInput): ViewWindow[];
