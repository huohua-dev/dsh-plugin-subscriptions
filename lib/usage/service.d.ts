import { type TrackedProvider } from './constants.js';
import type { PreTracking, PreTrackingStatus } from './pre-tracking.js';
import { type UsageFileSystem } from './usage-files.js';
import { type WindowStore } from './window-store.js';
import type { ObservedWindow, WindowUsageEntry } from './window-tracker.js';
import { type UsageView, type ViewQuery } from './window-view.js';
/** What the service needs from the window store. */
export type UsageStoreView = Pick<WindowStore, 'dir' | 'ready' | 'trackingStartedAt' | 'tracker' | 'entries' | 'unsavedDeltas' | 'unsavedDayDeltas' | 'clearedAt' | 'clearProvider'>;
export interface UsageServiceOptions {
    store: UsageStoreView;
    /** The before-tracking totals; absent reads as "unavailable" (PRE-HEADLESS). */
    preTracking?: Pick<PreTracking, 'status'>;
    fs?: UsageFileSystem;
}
export interface AccountUsageQuery extends ViewQuery {
    provider: TrackedProvider;
    account: string;
}
export interface AccountUsageResult {
    view: UsageView;
    /** Damaged files or lines that were skipped (SVC-ERRORS). */
    errors: string[];
}
/** What a clear would remove. */
export interface StoredSummary {
    /** Accounts with visible stored history. */
    accounts: number;
    /** Earliest `countedFrom` of the stored windows; absent when nothing is stored. */
    from?: number;
    /**
     * Latest end of the stored windows, each ending as §3.5 defines it:
     * `endedAt`, else its reset (also for an open window, so this can lie in
     * the future), else its last counted request; absent when nothing is stored.
     */
    to?: number;
    /** A non-empty before-tracking total is stored; listed as "earlier history" without dates. */
    earlierHistory: boolean;
}
export interface ClearResult {
    clearedAt: number;
    /** A purge that failed after the cut-off was written: the cut-off holds and the purge is retried. */
    errors: string[];
}
/** Single-load snapshot of one provider's usage state, avoiding redundant disk reads. */
export interface ProviderUsageSnapshot {
    provider: TrackedProvider;
    entries: WindowUsageEntry[];
    errors: string[];
    total: PreTrackingStatus;
    clearedAt?: number;
    trackingStartedAt: number;
    /** Stored accounts with visible history, in sorted key order. */
    accounts: string[];
    stored: StoredSummary;
    observed: (account: string) => ObservedWindow[];
}
/** Compute clear-confirmation summary from already-loaded entries without spread stack limits. */
export declare function summarizeStored(all: readonly WindowUsageEntry[], total: PreTrackingStatus, clearedAt?: number): StoredSummary;
/** Usage tracking is off in this process, or the service was disposed. */
export declare class UsageUnavailable extends Error {
    readonly code = "USAGE_UNAVAILABLE";
}
export declare class UsageService {
    private readonly store;
    private readonly preTracking;
    private readonly fs;
    private readonly caches;
    /** Bumped by every clear, so a read that overlapped one starts again and never caches or shows pre-clear data. */
    private readonly generations;
    private disposed;
    constructor(options: UsageServiceOptions);
    /**
     * Load one provider's full snapshot in a single disk pass so callers that
     * need accounts, view, summary, or dashboard aggregation read consistent
     * state without repeating `load(provider)`.
     * @throws UsageUnavailable when tracking is off or the service was disposed.
     */
    snapshot(provider: TrackedProvider): Promise<ProviderUsageSnapshot>;
    /**
     * One account's view for one query, with the damaged data that was
     * skipped.
     * @throws UsageUnavailable when tracking is off or the service was disposed.
     */
    read(query: AccountUsageQuery): Promise<AccountUsageResult>;
    /**
     * Accounts that have stored, visible history (any account, including one
     * removed from settings), in key order.
     * @throws UsageUnavailable when tracking is off or the service was disposed.
     */
    accounts(provider: TrackedProvider): Promise<string[]>;
    /**
     * What the provider has stored, for the clear confirmation.
     * @throws UsageUnavailable when tracking is off or the service was disposed.
     */
    summary(provider: TrackedProvider): Promise<StoredSummary>;
    /** The provider's entries a reader may show: none counted before its clear. */
    private visible;
    /**
     * Clear one provider's history through the store, and drop its
     * caches. No real window is re-opened.
     * @returns the new cut-off, and the purge error when only the delete failed.
     * @throws when this clear's cut-off was not written (an earlier clear's
     *   cut-off does not count): nothing was cleared.
     */
    clear(provider: TrackedProvider): Promise<ClearResult>;
    /** Later reads and clears are refused; a read in flight is rejected, never left unhandled. */
    dispose(): void;
    /**
     * The file a file-system error names, relative to the usage directory (for
     * example `claude/open.json`), or `<provider>/` when it names none or one
     * outside it: an absolute path never reaches a result (SVC-ERRORS).
     */
    private relativeLabel;
    private ensureOpen;
    private invalidate;
    /** The provider's entries (memory first, then `open.json`, then closed files), errors and total; restarted if a clear overlapped. */
    private load;
    /** Reads the shared clear marker even when this process has not saved since a peer cleared. */
    private readClearCutoff;
    /**
     * This process's entries joined with the stored ones. An id that is
     * also stored may carry another process's committed counts, which this
     * process's memory never sees: each stored copy gets this process's unsaved
     * delta added, and the in-memory copy (first, with this process's latest
     * boundaries) takes the sums of the closed copy if there is one, else the
     * open one. The view then lets a closed copy win, and nothing is
     * counted twice or hidden.
     */
    private combine;
    /** `open.json` and every closed file of the provider, each from cache while its stat key is unchanged. */
    private readFiles;
    /** One file, re-read only when its size or modification time changed; `undefined` when it vanished meanwhile. */
    private readFile;
    /** The before-tracking status; a damaged stored total is named in `errors`. */
    private readTotal;
}
