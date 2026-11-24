import type { TrackedProvider } from '../usage/usage-schema.js';
import type { DashboardDailyBucket } from '../usage/usage-dashboard.js';
import type { KindOption, ViewMarker } from '../usage/window-view.js';
import type { SubscriptionsKey } from './locales.js';
export type Translate = (key: SubscriptionsKey, params?: Record<string, unknown>) => string;
export declare const TRACKED_PROVIDERS: readonly {
    id: TrackedProvider;
    name: string;
    colorVar: string;
}[];
export declare function providerDisplayName(provider: TrackedProvider): string;
export declare function providerAccentColor(provider: TrackedProvider): string;
/** Locale keys for usage-window markers. */
export declare const MARKER_KEYS: Readonly<Record<ViewMarker, SubscriptionsKey>>;
/** A token count in the browser locale. */
export declare function formatTokens(count: number): string;
/** Compact human-readable token count (e.g. `12.4K`, `1.85M`, `2.3B`). */
export declare function formatCompactTokens(count: number): string;
/** Share percentage string (`0%`, `<0.1%`, `12.4%`, `100%`). */
export declare function formatPercent(share: number): string;
/** An absolute instant in the browser locale. */
export declare function formatInstant(at: number): string;
export declare function formatShortUtcDate(isoDate: string): string;
/** "5-hour window", "Weekly · Opus", "Not observed yet". */
export declare function kindLabel(t: Translate, option: KindOption): string;
/** A stable `<select>` value for a kind option. */
export declare function kindValue(option: KindOption): string;
export declare function parseKindValue(value: string): KindOption;
/** The window's start and end, or "from" when its end is not known yet. */
export declare function windowRangeText(t: Translate, window: {
    countedFrom: number;
    end?: number;
}): string;
/** Compact, scannable UTC cycle range like `11-22 14:00 – 19:00 UTC` or `11-16 00:00 – 11-23 00:00 UTC`. */
export declare function formatCycleTimeRange(t: Translate, cycle: {
    startsAt?: number;
    countedFrom: number;
    endsAt?: number;
}): string;
/** Compact relative duration like `3d 4h`, `2h 15m`, `45m`, `<1m`. */
export declare function formatRelativeDuration(ms: number): string;
/** Semantic severity tone for quota percentage consumption. */
export declare function quotaProgressTone(percent: number): 'ok' | 'warn' | 'danger';
/** Compact UTC axis label for a quota cycle (`11-22 14h` for 5h windows, `11-16` for weekly/monthly). */
export declare function formatCycleAxisLabel(cycle: {
    kind: KindOption['kind'];
    startsAt?: number;
    countedFrom: number;
}): string;
/** Compute 4–5 clean rounded Y-axis ticks from 0 to >= maxValue. */
export declare function computeNiceTicks(maxValue: number, segments?: number): number[];
/** Classify a day's token count into a 0..4 heatmap intensity level using sqrt scaling so moderate days remain distinct. */
export declare function heatmapLevel(tokens: number, maxTokens: number): 0 | 1 | 2 | 3 | 4;
export interface HeatmapCell {
    date?: string;
    bucket?: DashboardDailyBucket;
    level: 0 | 1 | 2 | 3 | 4;
}
export interface HeatmapGrid {
    weeks: HeatmapCell[][];
    monthLabels: {
        col: number;
        label: string;
    }[];
    maxTokens: number;
}
/** Arrange chronological UTC daily buckets into Sun..Sat week columns for a GitHub-style calendar heatmap. */
export declare function buildHeatmapWeeks(days: readonly DashboardDailyBucket[]): HeatmapGrid;
