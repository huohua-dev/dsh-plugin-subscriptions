import { type TrackedProvider } from './constants.js';
import { type HostSessionLog, type HostSessionQuery } from './host-events.js';
import { type ModelSums, type PreTrackingTotal } from './usage-schema.js';
import { type UsageFileSystem } from './usage-files.js';
export type { PreTrackingTotal } from './usage-schema.js';
/** What the fold of a whole history gives. */
export interface PreTrackingFold {
    totals: Record<TrackedProvider, ModelSums>;
    /** Usage samples with no provider at all: in no total, reported as a diagnostic. */
    unattributed: number;
    /** Usage samples rejected whole: a bucket not a non-negative safe integer, or a sum past `MAX_SAFE_INTEGER`. */
    invalid: number;
}
/**
 * Folds DSH session logs into per-provider, per-model totals of the usage
 * before `trackingStartedAt` (PRE-FOLD). Pure: no clock, no I/O. Logs are
 * added one at a time, so a scan never holds more than one in memory.
 *
 * Counted events:
 * - `assistant/message`: its `usage`, else the last usage chunk of its
 *   stream; route from `message.source`, else the latest `request/context`.
 * - `assistant/attempt`: the last usage chunk of its stream; route from the
 *   latest `request/context`.
 * - `compaction/summary`: its `usage` and its own route.
 * Every other event type is ignored, so an unknown type never fails a scan.
 *
 * Only events strictly before `trackingStartedAt` count: one at the instant
 * belongs to the window entries (PRE-STRADDLE). The first
 * `inheritedEventCount` events of a fork are its parent's and are counted
 * there; a `request/context` among them still sets the route of the child's
 * own events, because DSH logs it only when the route changes.
 */
export declare class PreTrackingFolder {
    private readonly trackingStartedAt;
    private readonly totals;
    private unattributed;
    private invalid;
    constructor(trackingStartedAt: number);
    /** Fold one session's complete log. */
    add(log: HostSessionLog): void;
    /** The totals so far. */
    result(): PreTrackingFold;
    /** The usage sample of an assistant settlement, with its slot and route; `undefined` for any other event or none. */
    private sampleOf;
    /**
     * dsh-token-meter's `tokenUsage` rule: a sample in the same (turn,
     * step) slot as the previous one replaces it, so its counts are taken
     * out again before the new ones are added. A replaced sample that was not
     * counted here (inherited, at or after the start, unattributed or
     * rejected) has nothing to take out. A sample that is not counted itself
     * replaces nothing: at or after the tracking start it belongs to the
     * window entries, which count every request on its own, so the earlier
     * sample stays in this total. A rejected sample is skipped whole,
     * as if it were not logged: the slot and the sample it would replace stay
     *.
     * @returns the slot held after the sample.
     */
    private place;
    /** Add one sample to its provider's total; `undefined` when it was not added, {@link REJECTED} when it was rejected whole. */
    private count;
}
/** Fold a whole history at once (see {@link PreTrackingFolder}). */
export declare function foldSessions(logs: Iterable<HostSessionLog>, trackingStartedAt: number): PreTrackingFold;
/** What the before-tracking block of one provider shows. */
export type PreTrackingStatus = 
/** The stored total. */
{
    state: 'stored';
    total: PreTrackingTotal;
}
/** The provider was cleared: the total is gone for good and never recomputed. */
 | {
    state: 'cleared';
}
/** "Earlier history not computed yet": the scan has not stored a total yet (PRE-ONCE). */
 | {
    state: 'not-computed';
}
/** "Earlier history unavailable in this profile": no `sessionQuery` (PRE-HEADLESS). */
 | {
    state: 'unavailable';
};
export interface PreTrackingOptions {
    /** Resolves the tracking start once the window store has loaded; `undefined` when tracking is disabled (no scan). */
    trackingStartedAt: () => Promise<number | undefined>;
    /** The usage directory; defaults to `dshHomePath('plugins', 'subscriptions', 'usage')`, resolved at construction. */
    dir?: string;
    fs?: UsageFileSystem;
    /** The lock clock. */
    now?: () => number;
    onWarn?: (message: string) => void;
    lockStaleMs?: number;
}
/**
 * The one-time scan and its stored totals.
 *
 * - A scan starts when `sessionQuery` is attached and some tracked provider
 *   that was never cleared has no total for this tracking start. It reads
 *   every session, folds them, and only then writes, one atomic file per
 *   provider. A session that cannot be read is skipped with a warning
 *  . A scan that fails or is cut short writes nothing, so the next
 *   startup scans again up to the same `trackingStartedAt` (PRE-ONCE).
 * - Each file is written under the provider's lock after re-reading
 *   `meta.json`: a clear writes `clearedAt` before it purges under that
 *   lock, so a total is never written after its clear, and one written just
 *   before is removed by the purge (PRE-CLEAR).
 * - Once every total is stored, no session is read again.
 */
export declare class PreTracking {
    readonly dir: string;
    private readonly fs;
    private readonly now;
    private readonly warn;
    private readonly lockStaleMs;
    private readonly startedAt;
    /** The scan of the attachment that is current, if one is; a newer attachment aborts the older one's. */
    private attached;
    private queue;
    constructor(options: PreTrackingOptions);
    /**
     * The session history became available: run the one-time scan in the
     * background if a total is missing. Never throws; failures are warnings.
     * @returns detach: aborts a running scan (one still reading writes
     *   nothing) and makes the history unavailable again. Its promise resolves
     *   once the scan has stopped, or after the shutdown bound with a warning
     *  : a session read cannot be cancelled on the host and the final
     *   writes wait for locks, so an unbounded wait could hang shutdown.
     */
    attach(query: HostSessionQuery): () => Promise<void>;
    /** Resolves when no scan is running or queued. */
    settled(): Promise<void>;
    /**
     * The before-tracking block of `provider`. Reads only `meta.json` and the
     * provider's `pre-tracking.json`; never the session history (PRE-ONCE).
     */
    status(provider: TrackedProvider): Promise<PreTrackingStatus>;
    private path;
    /** The stored total, or `undefined` when there is none or it is invalid. */
    private readTotal;
    /**
     * The providers still needing a total: tracked, never cleared, and with
     * no valid total folded up to this tracking start. A total for another
     * start (meta.json was recreated) does not count, so it is replaced.
     */
    private missing;
    private scan;
    /**
     * One session's log, or `undefined` when it cannot be read: an
     * unreadable or corrupt session is skipped with one warning, and the scan
     * goes on. Failing the scan instead would fail every startup again on the
     * same file, so no total would ever be stored. The warning names the
     * session and the error's code only: DSH's message can quote the log or
     * its path. The id is JSON-quoted, as it comes from the stored header and
     * could hold a line break. An abort is not a read failure and still
     * stops the scan.
     */
    private readOrSkip;
    /** Write one provider's total under its lock, unless it was cleared or stored meanwhile (another process). */
    private store;
}
