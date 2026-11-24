import type { ProviderUsage, UsageWindow } from '../providers/common.js';
import { type TrackedProvider, type WindowKind } from './constants.js';
export type { TrackedProvider, WindowKind } from './constants.js';
/** A Window 0 before the account's first snapshot has no kind yet. */
export type EntryKind = WindowKind | 'pending';
/**
 * Where an entry's `startsAt` came from. The common sources are
 * `disclosed`, `length`, `nominal` and `previous-reset`; `redemption` is an
 * exact in-plugin credit redemption; `first-usage` marks Window 0; and
 * `observed` means no rule gave a start, so the window starts at the
 * observation that opened it (a fallback after an early reset).
 */
export type StartSource = 'disclosed' | 'length' | 'nominal' | 'previous-reset' | 'redemption' | 'first-usage' | 'observed';
/** Disjoint token buckets of one model; the two cache-write durations are subsets of `cacheWriteTokens`. */
export interface TokenCounts {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    cacheWrite5mTokens?: number;
    cacheWrite1hTokens?: number;
}
/** The disjoint buckets every model sum has; exported so the store sums and validates the same set. */
export declare const REQUIRED_BUCKETS: readonly ["inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens"];
/** The cache-write duration subsets of `cacheWriteTokens`, Claude only. */
export declare const SPLIT_BUCKETS: readonly ["cacheWrite5mTokens", "cacheWrite1hTokens"];
/** One aggregate window entry. */
export interface WindowUsageEntry {
    v: 1;
    /** Fixed when the entry is created, unique, and kept through reclassification. */
    id: string;
    provider: TrackedProvider;
    account: string;
    kind: EntryKind;
    /** Set only on Window 0 entries. */
    window0?: 'tracking-start' | 'cleared';
    scope?: string;
    /** Absent on Window 0. */
    startsAt?: number;
    startSource: StartSource;
    /** Latest observed reset; absent while a chained window's reset is not reported ("boundaries not known yet"). */
    resetsAt?: number;
    /** Minimum and maximum observed reset, so a later tolerance can re-merge entries on read. */
    resetRange?: [number, number];
    status: 'open' | 'closed' | 'ended-early';
    /** Set on ended-early entries, a closed Window 0, and a chained entry closed at its start + length. */
    endedAt?: number;
    /** Ended-early only: `detected` from a snapshot or an exact `redemption` (no note). */
    endReason?: 'detected' | 'redemption';
    countedFrom: number;
    lastAddedAt?: number;
    /** Latest observed provider quota utilization for this window (0–100). */
    quotaUsedPercent?: number;
    /** Peak observed provider quota utilization during this window (0–100). */
    quotaPeakPercent?: number;
    /** Epoch ms when `quotaUsedPercent` was observed (used for multi-process freshest-wins reconciliation). */
    quotaObservedAt?: number;
    models: Record<string, TokenCounts>;
    /** Actual UTC dates of recorded requests; legacy entries need not have any. */
    days?: Record<string, Record<string, TokenCounts>>;
}
/** What the latest snapshot said about one series, for the view. */
export interface ObservedWindow {
    kind: WindowKind;
    scope?: string;
    /** False shows "reset time not reported". */
    resetReported: boolean;
    /** The disclosed or nominal length, when known. */
    lengthMs?: number;
}
/** Counts held for a series between a stale chained entry and the next snapshot. */
export interface HeldSum {
    kind: WindowKind;
    scope?: string;
    countedFrom: number;
    lastAddedAt: number;
    models: Record<string, TokenCounts>;
    /** Actual UTC dates of recorded requests; legacy entries need not have any. */
    days?: Record<string, Record<string, TokenCounts>>;
}
/** One reported window of one account, followed across snapshots. Exported as a type so the store can validate restored state. */
export interface SeriesState {
    /** {@link seriesKey}: the provider's kind and scope; the identity of one reported window across snapshots. */
    key: string;
    kind: WindowKind;
    scope?: string;
    /** Use the same exact-scope matching as account pool quotas. */
    scopeExact?: boolean;
    resetReported: boolean;
    /** The disclosed or nominal length; an observed reset-to-reset length is not used for it. */
    lengthMs?: number;
    /** Last reported reset, for classifying an `other` window by its observed length. */
    lastReset?: number;
    /** A start-less series anchors when this first observed reset is reached (R1). */
    pendingR1?: number;
    anchored: boolean;
    /**
     * First observation of a series that appeared after the account's first
     * snapshot. Its earlier requests were not counted for it, so its
     * first real entry may not claim to count from before this instant.
     */
    countFloor?: number;
    window0?: string;
    open?: string;
    /** End of the last real entry, when the series has no open entry . */
    lastEnd?: number;
    held?: Omit<HeldSum, 'kind' | 'scope'>;
    /**
     * The account's latest snapshot did not report this window (a renamed
     * scope, a model dropped from Antigravity's list, a bucket a provider
     * omits for one fetch). It keeps counting into whatever target it already
     * has, its open entry, open Window 0 or held sum, until that ends, so a
     * one-fetch omission loses nothing; it creates nothing new: no chained
     * entry, Window 0, held sum or redemption split. It resumes by the normal rules when a later
     * snapshot reports it again.
     */
    absent?: true;
    /**
     * A request applicable to this series was turned away while it was
     * absent with nothing to count into. The next entry it opens then counts
     * from its own opening observation, not from the previous end, so it
     * never claims coverage of requests it did not receive.
     */
    turnedAway?: true;
    /**
     * Ids of the series' entries still in memory. While the series is
     * unclassified this also keeps drained ids, so the reclassification event
     * can name already saved entries, which become visible too.
     */
    entryIds: string[];
}
/** One account's tracker memory. Exported as a type so the store can validate restored state. */
export interface AccountState {
    provider: TrackedProvider;
    account: string;
    snapshotSeen: boolean;
    pending?: string;
    series: SeriesState[];
}
/** Serialisable tracker memory: what {@link WindowTracker.state} returns and the constructor restores. */
export interface TrackerState {
    v: 1;
    /** Latest instant applied; absent before the first event (JSON has no -Infinity). */
    now?: number;
    accounts: AccountState[];
    entries: WindowUsageEntry[];
}
/** A series classified after some of its entries were created: those entries now have `kind`. */
export interface Reclassification {
    provider: TrackedProvider;
    account: string;
    kind: WindowKind;
    /** Every entry of the series, including ones already drained by {@link WindowTracker.drainClosed}. */
    ids: string[];
}
/** A series' held counts were promoted into a real window entry on reopen. */
export interface HeldPromotion {
    provider: TrackedProvider;
    account: string;
    seriesKey: string;
    entryId: string;
}
export interface WindowTrackerOptions {
    /** When tracking started; nothing earlier is counted or anchors a window. */
    trackingStartedAt: number;
    /** Per-provider clear instants; nothing earlier is counted or anchors a window. */
    clearedAt?: Partial<Record<TrackedProvider, number>>;
    state?: TrackerState;
    /**
     * Called once each time an entry leaves `open`; the store saves at window close. Like `onReclassify`, it runs after the operation that caused it
     * has finished, so it may call back into the tracker; its errors go to
     * `onWarn` and never reach the tracker's caller.
     */
    onClose?: (entry: WindowUsageEntry) => void;
    /** Called when a series is classified, naming its entries, drained ones included. */
    onReclassify?: (change: Reclassification) => void;
    /** Called when a series' held sum is promoted into a newly opened real entry. */
    onHeldPromote?: (promotion: HeldPromotion) => void;
    /** Rejected counts and callback errors. */
    onWarn?: (message: string) => void;
}
/** Whether `provider` is one of the tracked subscription routes. */
export declare function isTrackedProvider(provider: string): provider is TrackedProvider;
/** Classify a window length (inclusive ranges); anything else is unclassified. */
export declare function classifyLength(lengthMs: number): WindowKind;
/** Classify one reported window: `session` and `weekly` by name, `other` by its disclosed length. */
export declare function classifyWindow(window: UsageWindow): WindowKind;
/** Every bucket a non-negative safe integer; exported so the store can validate a usage chunk once. */
export declare function validCounts(counts: TokenCounts): boolean;
/** All buckets zero: such a chunk adds nothing and creates no entry. */
export declare function emptyCounts(counts: TokenCounts): boolean;
/** Whether adding `counts` to `models[model]` would pass `MAX_SAFE_INTEGER` in any bucket; exported for the before-tracking fold. */
export declare function overflows(models: Record<string, TokenCounts>, model: string, counts: TokenCounts): boolean;
/** Add `counts` into `models[model]` in place; exported for the before-tracking fold. */
export declare function addModel(models: Record<string, TokenCounts>, model: string, counts: TokenCounts): void;
/** Add every model sum of `from` (those `applies` accepts) into `models`, in place. */
export declare function addModels(models: Record<string, TokenCounts>, from: Record<string, TokenCounts>, applies?: (model: string) => boolean): void;
export declare class WindowTracker {
    private now;
    private readonly accounts;
    private readonly entryById;
    private readonly clearedAt;
    private readonly trackingStartedAt;
    private readonly options;
    /**
     * Callbacks raised during an operation, run once it has finished. Running
     * them mid-transition would let a throwing or re-entrant callback leave a
     * series closed with no successor.
     */
    private readonly notifications;
    private depth;
    constructor(options: WindowTrackerOptions);
    /**
     * Record one completed usage fetch, observed at `observedAt` (the fetch
     * completion time). Opens, updates, chains or ends entries; never
     * throws for an untracked provider or an unsupported snapshot.
     */
    observe(provider: string, account: string, snapshot: ProviderUsage, observedAt: number): void;
    /**
     * Add one finished request's counts for `model`, finished at `finishedAt`,
     * to every window of the account it applies to.
     * @returns the ids of the entries that received the counts; held counts
     *   and ignored requests return none.
     */
    add(provider: string, account: string, model: string, finishedAt: number, counts: TokenCounts): string[];
    /**
     * A credit redeemed through the plugin at `at` (confirmed success only):
     * the account's open 5-hour and weekly entries end early, exactly, and new
     * entries open from `at`. An absent series
     * is skipped because it creates no new entry; its open entry keeps
     * counting, and the moved reset is applied by the snapshot rules
     * once the window is reported again.
     */
    redeem(provider: string, account: string, at: number): void;
    /**
     * Apply every transition due by `now`: resets reached (even with
     * no request), first resets R1 reached, and stale chained entries closed
     * at start + length. Called by every mutating method first; the store also calls
     * it from a timer so windows close on time without traffic.
     * @returns the instant applied (never earlier than one already applied).
     */
    advance(now: number): number;
    /**
     * Forget one provider's memory after a clear at `clearedAt`; later Window
     * 0 are `cleared`. Notifications already queued for it are
     * still delivered; the store's `clearedAt` cut-off drops them.
     */
    clear(provider: string, clearedAt: number): void;
    /** Copies of the entries in memory (open and not yet drained), oldest `countedFrom` first. */
    entries(provider?: string, account?: string): WindowUsageEntry[];
    /** The windows the account's latest snapshot reported, with what it said; stored entries of others stay in `entries`. */
    observedWindows(provider: string, account: string): ObservedWindow[];
    /** Counts held between a stale chained entry and the next snapshot. */
    heldSums(provider: string, account: string): HeldSum[];
    /** Remove the closed and ended-early entries from memory and return them, for the store to append. */
    drainClosed(): WindowUsageEntry[];
    /**
     * A JSON-serialisable deep copy of the whole tracker memory. The store persists
     * the open entries from this (not by merging ids), because a pending
     * Window 0 copied into per-kind Window 0 entries is discarded without an
     * event.
     */
    state(): TrackerState;
    /** Run one public operation; queued callbacks run after the outermost one finishes. */
    private operation;
    private warn;
    /**
     * Move the clock to `now` (never backwards) and apply what became due. A
     * non-finite instant is ignored: `+Infinity` would close every window at
     * once, and the clock could never come back from it.
     */
    private advanceTo;
    /** Tracked provider, finite instant, and not before tracking start or the provider's clear. */
    private admits;
    private accountState;
    /** Before the account's first snapshot its kinds are unknown: the request goes to the pending Window 0. */
    private addToPending;
    /** After the first snapshot: into the {@link target} of every series the model applies to. */
    private addToSeries;
    /** Whether adding `counts` would pass `MAX_SAFE_INTEGER` in any of `sums`; warns when it would. */
    private rejectsOverflow;
    /**
     * Where a request for `series` goes: what the series already has
     * ({@link existingTarget}), else a new held sum (anchored) or a
     * new Window 0 (created lazily before anchoring).
     *
     * An absent series creates nothing new (decision T2-4), so with no
     * existing target the request is turned away. What it already has keeps
     * counting, so each entry covers exactly the requests it received.
     * A renamed scope that still matches by `windowApplies` counts
     * into the old target too until it ends or the user clears.
     */
    private target;
    /** The series' open real entry; else, once anchored, its held sum; before anchoring, its Window 0. */
    private existingTarget;
    /**
     * Pair each window of a snapshot with the account's existing series.
     *
     * A series is identified by the provider's kind and scope ({@link seriesKey}).
     * Keying by order or by disclosed class instead would re-key a series when
     * a provider reorders windows or starts or stops disclosing `durationMs`
     * (Grok's legacy billing never does), and the abandoned series would keep
     * counting: one request in two windows, which no per-request record could
     * undo. Several windows with one key in a snapshot (two unscoped
     * `other` windows, from Claude's unknown `limits[]` kinds or Codex's odd
     * lengths) are paired with that key's series as a whole, best pair first
     * ({@link pairScore}), so a newly reported window cannot take an existing
     * window's series and read as its early reset. Windows left over get
     * new series.
     * @returns the windows with their series; `undefined` where a new series is needed.
     */
    private matchSeries;
    /** Create the series of one reported window if needed, and record what this snapshot says about it. */
    private upsertSeries;
    /**
     * Classify an unclassified series once (`unclassified` itself is a
     * no-op); its in-memory entries take the kind, ids unchanged, and
     * `onReclassify` names every entry so the store can update the ones already
     * saved. A classified series never changes kind again: a later different
     * disclosed length is read as jitter of the provider's report, not as a
     * different window.
     */
    private reclassify;
    /** copy the pending Window 0 into a Window 0 per reported series, per model by `windowApplies`, then discard it. */
    private splitPending;
    /** One reported window's reset applied to its series; a window with no future reset changes nothing here. */
    private applyReset;
    /** Record the snapshot's observed quota utilization % (0–100) onto the series' active entry. */
    private recordQuotaPercent;
    /** An open entry with a known reset sees `reset`: jitter of the same window, or an early reset. */
    private compareReset;
    /**
     * the first reset reported after the series' last entry ended
     * opens the next window, which takes the held counts. It counts from the
     * first held request; else from the opening observation if a request was
     * turned away meanwhile (it must not claim that request); else from the
     * window's start, but not before the previous entry's end.
     */
    private reopen;
    /**
     * The first real entry of a series with a derivable start. It counts from the anchoring observation when a Window 0
     * closes there, or when a request was turned away before it (it must not
     * claim that request); otherwise from max(start, tracking start or clear,
     * the series' first observation).
     */
    private anchor;
    /** Apply the transitions due by `this.now` to one series, oldest first, until none is due. */
    private advanceSeries;
    /** an open entry whose reset is reached closes there, and the next window opens from it. */
    private chainAtReset;
    /**
     * a chained entry whose reset was never reported closes at its
     * start + length, kept even when empty, with no chaining across missed
     * windows. A series with no disclosed or nominal length (monthly or
     * unclassified without `durationMs`) never does: it stays open, still
     * counting, until the next observed reset closes it.
     */
    private closeStale;
    /**
     * a start-less series anchors exactly at its first observed reset R1
     * once R1 is reached. An absent series opens nothing, so if R1
     * passes while it is absent, it waits until the window is reported again.
     * - If its Window 0 kept counting past R1 meanwhile, the split at
     *   R1 is no longer exact, and Window 0 closes only at an exact R1 (plan
     *   §3.3): R1 is dropped and the next reported reset anchors instead.
     * - If a request was turned away (no Window 0), the entry still starts at
     *   R1 but counts from its own opening, like {@link anchor}, so it never
     *   claims that request.
     */
    private reachR1;
    /** The series has no open entry from `end` until a reported reset reopens it . */
    private endSeries;
    /** A new open Window 0 counted from `at`; the caller attaches it. */
    private createWindow0;
    private attachWindow0;
    /** Close the series' Window 0 at `at`, if it has one; the caller opens the first real entry. */
    private closeWindow0;
    private openReal;
    private create;
    private lookup;
    private openEntry;
    private endEarly;
    /** Mark `entry` closed and queue `onClose` with a copy: the entry may change again before the callback runs. */
    private close;
    private cutoff;
}
