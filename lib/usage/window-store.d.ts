import type { ProviderUsage } from '../providers/common.js';
import type { RequestEnd } from '../providers/replay.js';
import { type TrackedProvider } from './constants.js';
import { type DaySums, type ModelSums } from './usage-schema.js';
import { type UsageFileSystem } from './usage-files.js';
import { WindowTracker, type WindowUsageEntry } from './window-tracker.js';
export { nodeUsageFileSystem, type UsageFileSystem } from './usage-files.js';
export interface WindowStoreOptions {
    /** The usage directory; defaults to `dshHomePath('plugins', 'subscriptions', 'usage')`, resolved at construction. */
    dir?: string;
    fs?: UsageFileSystem;
    /** The clock for tracking start, lock age, the timer-driven advance and dispose. */
    now?: () => number;
    onWarn?: (message: string) => void;
    saveDelayMs?: number;
    lockStaleMs?: number;
    advanceIntervalMs?: number;
}
/** One line of a closed file, parsed when it is a valid entry; other lines are kept verbatim. */
export interface ClosedLine {
    text: string;
    entry?: WindowUsageEntry;
    /** 1-based line number in the file as read; absent on a line this process built. */
    line?: number;
}
export declare class WindowStore {
    readonly dir: string;
    readonly ready: Promise<void>;
    private readonly fs;
    private readonly now;
    private readonly warn;
    private readonly saveDelayMs;
    private readonly lockStaleMs;
    private live;
    private meta;
    /** Events that arrived before the files were loaded, applied in order once they are. */
    private readonly early;
    /** Providers with changes not yet saved. */
    private readonly dirty;
    /** Per provider and entry id: the model sums this process has committed for the entry (its last saved view). */
    private readonly baselines;
    /** Last committed local view of held sums, by account and series. */
    private readonly heldBaselines;
    /** Unsaved held-sum promotions: heldKey(account, seriesKey) -> entryId that received the held counts. */
    private readonly heldPromotions;
    /** Ids found both open and closed on disk at load (a crash between the two writes); removed from `open.json` at the next save. */
    private readonly staleOpen;
    /** Set once loading finished, whether or not tracking is enabled. */
    private loaded;
    /** Entries drained from the tracker after closing, until their closed line is committed. */
    private readonly closing;
    /** Entry ids whose series was classified after they were saved, with the new kind. */
    private readonly reclassified;
    private saveTimer;
    private advanceTimer;
    private queue;
    private disposing;
    constructor(options?: WindowStoreOptions);
    /** When per-account tracking started; undefined before {@link ready} or when tracking is disabled. */
    get trackingStartedAt(): number | undefined;
    /** The live in-memory tracker; undefined before {@link ready} or when tracking is disabled. */
    get tracker(): WindowTracker | undefined;
    /**
     * This process's in-memory view of a provider's entries, for the reader
     * includes the tracker's open entries, with their unsaved counts, and the
     * closed ones not yet written to their year file. Copies; never I/O.
     */
    entries(provider: TrackedProvider): WindowUsageEntry[];
    /**
     * This process's counts not yet saved, per entry id: its in-memory sums
     * minus what it last committed. A reader adds them to the stored
     * copy of an id another process may also write, because the in-memory
     * entry is never refreshed with that process's commits.
     */
    unsavedDeltas(provider: TrackedProvider): Map<string, ModelSums>;
    /** Daily portion of unsavedDeltas; old window totals may have no date allocation. */
    unsavedDayDeltas(provider: TrackedProvider): Map<string, DaySums>;
    /** The provider's clear cut-off as this process knows it; undefined when never cleared or tracking is off. */
    clearedAt(provider: TrackedProvider): number | undefined;
    /** The snapshot hook: one completed usage fetch. */
    observe(provider: string, account: string, snapshot: ProviderUsage, observedAt: number): void;
    /** The request-end hook: synchronous, no I/O, never throws. */
    recordRequest(end: RequestEnd): void;
    /** The redemption hook: a credit redeemed through the plugin at `at`. */
    redeem(provider: string, account: string, at: number): void;
    /** Save every provider with unsaved changes now, ignoring the delay; never rejects. */
    flush(): Promise<void>;
    /** Resolves when no save is running or queued. */
    settled(): Promise<void>;
    /**
     * Clear one provider's stored usage: the `clearedAt` cut-off
     * is written first, then this process forgets the provider, then its
     * files are purged under its lock. Earlier failed purges of any provider
     * are retried too.
     * @throws when the cut-off cannot be written or the provider's purge fails;
     *   a written cut-off still holds for readers, and the purge is retried.
     */
    clearProvider(provider: string): Promise<void>;
    /**
     * Stop the timers and save what is pending without waiting for the delay
     * (within a bounded wait). A held lock is waited for up to the staleness limit; if
     * the sums still cannot be written, or a running save hangs that long,
     * they are dropped with a warning. Later events are ignored.
     */
    dispose(): Promise<void>;
    private shutdown;
    /**
     * Run `apply` against the tracker now, or once loaded. An event is judged
     * when it arrives: one that arrived before dispose is applied even when
     * the load finishes after dispose was called (shutdown awaits `ready`,
     * which runs the queue before its final save); one that
     * arrives after dispose is ignored.
     */
    private event;
    /** Timer-driven advance: windows whose reset passed with no traffic close. */
    private advance;
    /** Whether `work` changed what would be saved for `provider` (any provider when undefined). */
    private changes;
    /** The providers whose saved state `work` changed (the tracker's clock is not saved, so it does not count). */
    private changedProviders;
    private fingerprints;
    /** the delay counts from the first unsaved change, so later changes do not re-arm it. */
    private markDirty;
    private armSave;
    private cancelSaveTimer;
    /** Run `work` after every queued save or clear; its errors become warnings. */
    private enqueue;
    /**
     * Save every dirty provider; one whose lock was held or whose write failed
     * stays dirty and is re-tried after the save delay.
     * @param lockWaitMs - how long to wait for a held lock (shutdown only).
     * @returns the providers that could not be saved.
     */
    private saveDirty;
    private baselineOf;
    /** Move the tracker's closed entries into {@link closing}, so they are saved even if the tracker forgets them. */
    private collectClosed;
    private closingOf;
    /** How long a waiting caller waits for a held lock: long enough for a lock held from the start to turn stale. */
    private lockWaitMs;
    private lock;
    private providerDir;
    private openPath;
    private closedPath;
    private closedPaths;
    private saveProvider;
    /**
     * another process cleared `provider` since this one last looked.
     * Deltas of entries counted before the clear are dropped. Entries
     * counted from it on are committed, closed at this instant because this
     * process stops following them, and the provider is forgotten, so later
     * requests go to a Window 0 `cleared`.
     */
    private adoptNewerClear;
    /** The read-merge-write of one provider, under its lock. */
    private writeProvider;
    /**
     * The closed lines are on disk, even if the `open.json` rewrite after them
     * fails: record that now, so a retry does not add the same delta to them
     * again. A closed entry leaves {@link closing}, and its open copy, still in
     * `open.json` until the rewrite succeeds, is stale (the closed copy wins,
     * so readers use the closed copy). An entry still open here but closed by another process
     * gets its baseline moved to what was just added.
     */
    private closedCommitted;
    /**
     * Write closed entries to their year files, before `open.json`,
     * and apply pending reclassifications to saved lines. A new id is
     * appended; an id already in its file gets the delta added to that line,
     * which is then the final copy (an append that crashed before the open
     * rewrite, or another process's close of a shared entry).
     */
    private writeClosed;
    /** Ids of the valid lines in the provider's closed files: all of them, or the year files of `entries`. */
    private closedIds;
    /** The allowlisted copy of an entry; an entry that fails validation is not written. */
    private allowed;
    /** The allowlisted copy of an account state; an invalid account state is not written to `open.json`. */
    private allowedAccount;
    private readMeta;
    /**
     * Read `open.json` with its exact text (so an unchanged save writes
     * nothing). A file that is not JSON or not an open file is moved aside
     * with a warning and read as empty, so one damaged file stops neither
     * counting nor saving.
     */
    private readOpen;
    /**
     * Before a save rewrites an `open.json` that had invalid records, keep its
     * original text aside: usage is kept until the user clears it, and
     * the rewrite would remove them for good. A clear removes the copy with
     * the rest; after the rewrite there is nothing left to copy, so
     * this happens once per damage.
     */
    private keepDroppedAside;
    /** The lines of one closed file; a line that is not a valid entry is kept verbatim and skipped by readers. */
    private readClosed;
    /** Load meta, purge what earlier clears left, and restore each provider's open entries and window state. */
    private load;
    /**
     * `meta.json`: read it, or create it on the first start. It is
     * written under the meta lock, so two processes starting at once agree on
     * one `trackingStartedAt`. An invalid file disables tracking (thrown) and
     * is never overwritten.
     */
    private loadMeta;
    /**
     * The meta lock, or a throw when it stays held past the wait: `meta.json`
     * written by two processes at once could disagree on `trackingStartedAt`
     * or lose a `clearedAt`, so neither the first start nor a clear goes on
     * without it.
     */
    private acquireMetaLock;
    /**
     * One provider's open entries and window state from `open.json`.
     * - An entry already in a closed file (a crash between the append and the
     *   open rewrite) is taken from there: the stale open copy is not
     *   restored, and the series that referred to it continues without it.
     * - An open entry no restored series refers to was another process's
     *   (both write one file, and the last writer's window state wins). No
     *   process may follow it after a restart, so it is closed at `at`, like
     *   an entry this process stops following after a clear, and
     *   moved to its closed file at the next save. A process still running
     *   that holds it adds its later counts to that closed line.
     * - What a failed purge left of a clear at `cutoff` (entries counted
     *   before it, window state written before it) is not restored;
     *   the purge is retried at the next clear or startup.
     */
    private restore;
    /** Clear in this process: cut-off first, then forget, then purge (this provider's failure is thrown). */
    private clear;
    /** Drop this process's memory of `provider` (entries, deltas, pending closes). */
    private forget;
    /**
     * Remove everything of `provider` counted before `clearedAt`, under its
     * lock: `pre-tracking.json` (never recomputed after a clear, C4), entries
     * of `open.json` and the closed files counted before it (a file left empty
     * is deleted), the window state in `open.json`, and the directory once
     * empty. Idempotent, so it is safe to re-run at every startup.
     */
    private purge;
    private removeEmptyDir;
}
/**
 * The non-blank lines of a closed file, each with its line number: parsed and
 * allowlisted when it is a valid entry, kept verbatim with no
 * `entry` otherwise.
 */
export declare function parseClosed(provider: TrackedProvider, text: string): ClosedLine[];
