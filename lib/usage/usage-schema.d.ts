/**
 * The on-disk shapes of the usage store and their allowlist. Pure: parsing, validation and sum arithmetic only.
 *
 * Every entry is rebuilt from named keys before it is written, and every
 * loaded value is validated, so a field the schema does not name (a prompt,
 * a token, a per-request time) can never reach a file, and a damaged file
 * cannot feed the tracker malformed state.
 */
import { type TrackedProvider } from './constants.js';
export type { TrackedProvider } from './constants.js';
import { type AccountState, type TokenCounts, type WindowUsageEntry } from './window-tracker.js';
/** Per-model sums of one entry. */
export type ModelSums = Record<string, TokenCounts>;
export type DaySums = Record<string, ModelSums>;
/** `meta.json`. */
export interface UsageMeta {
    v: 1;
    trackingStartedAt: number;
    clearedAt: Partial<Record<TrackedProvider, number>>;
}
/** `<provider>/open.json`: open entries plus the tracker's window state of the provider's accounts. */
export interface OpenFile {
    v: 1;
    /**
     * The provider's `clearedAt` its writer knew. Window state written before
     * a clear would re-open windows from snapshots taken before it,
     * so the purge drops `accounts` unless this matches the clear.
     */
    clearedAt?: number;
    entries: WindowUsageEntry[];
    accounts: AccountState[];
}
/**
 * Per-model sums with exactly the allowlisted buckets: the five disjoint ones,
 * plus the two cache-write durations for Claude only.
 * @returns `undefined` when any bucket is missing or not a non-negative safe integer.
 */
export declare function sanitizeModels(provider: TrackedProvider, value: unknown): ModelSums | undefined;
/**
 * A copy of `value` holding only {@link WindowUsageEntry} keys, or
 * `undefined` when it is not a valid entry of `provider`.
 */
export declare function sanitizeEntry(provider: TrackedProvider, value: unknown): WindowUsageEntry | undefined;
/** A copy of one account's tracker state holding only {@link AccountState} keys, or `undefined` when invalid. */
export declare function sanitizeAccount(provider: TrackedProvider, value: unknown): AccountState | undefined;
/**
 * `<provider>/pre-tracking.json`: one provider's total from
 * before `trackingStartedAt`, per model. It holds the disjoint buckets only:
 * DSH logs never record the cache-write duration, so there is no
 * split, Claude included, and no account, session or per-event time.
 */
export interface PreTrackingTotal {
    v: 1;
    /** The tracking start this total was folded up to (exclusive). */
    trackingStartedAt: number;
    models: ModelSums;
}
/** Parse `pre-tracking.json`; `undefined` when it is not a valid total. */
export declare function parsePreTracking(value: unknown): PreTrackingTotal | undefined;
/** Parse `meta.json`; `undefined` when it is not a valid meta file. */
export declare function parseMeta(value: unknown): UsageMeta | undefined;
/**
 * Parse `<provider>/open.json`. Invalid entries and accounts are dropped one
 * by one, with their count, so one damaged record does not cost the others.
 * @returns `undefined` when the file as a whole is not an open file.
 */
export declare function parseOpenFile(provider: TrackedProvider, value: unknown): {
    file: OpenFile;
    dropped: number;
} | undefined;
/** The closed-file year of an entry: the UTC year of `startsAt`, else of `countedFrom`. */
export declare function closedYear(entry: Pick<WindowUsageEntry, 'startsAt' | 'countedFrom'>): number;
/** `a + sign × b`, bucket by bucket and model by model, as a new object. */
export declare function combineModels(a: ModelSums, b: ModelSums, sign?: 1 | -1): ModelSums;
/** Every bucket of every model zero (or no model at all). */
export declare function zeroModels(models: ModelSums): boolean;
/** Drop models whose sums are all zero, so a subtracted share leaves no empty rows. */
export declare function pruneModels(models: ModelSums): ModelSums;
/** Daywise addition/subtraction, preserving unallocated legacy window counts separately. */
export declare function combineDays(a: DaySums | undefined, b: DaySums | undefined, sign?: 1 | -1): DaySums;
