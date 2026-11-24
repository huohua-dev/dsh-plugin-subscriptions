import { type UsageMeta } from './usage-schema.js';
/** The file operations the store needs; injectable so tests can fail, hang or record them. Paths are absolute. */
export interface UsageFileSystem {
    /** Rejects with `ENOENT` when the file is missing. */
    readFile(path: string): Promise<string>;
    /** `exclusive` creates the file only if it does not exist (rejects with `EEXIST`). */
    writeFile(path: string, data: string, options?: {
        exclusive?: boolean;
    }): Promise<void>;
    appendFile(path: string, data: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    /** A missing path is not an error. */
    rm(path: string, options?: {
        recursive?: boolean;
    }): Promise<void>;
    /** Recursive: creates missing parents, and an existing directory is not an error. */
    mkdir(path: string): Promise<void>;
    /** A missing directory gives `[]`. */
    readdir(path: string): Promise<string[]>;
    /** `size` and `ctimeMs` are optional so a fake may omit them; the reader's cache then keys on what is given. */
    stat(path: string): Promise<{
        mtimeMs: number;
        ctimeMs?: number;
        size?: number;
    }>;
}
/** The real file system (node:fs/promises). */
export declare const nodeUsageFileSystem: UsageFileSystem;
/** The string `code` of an error (a Node file-system error, a DSH `HarnessError`), if any. */
export declare function errorCode(error: unknown): string | undefined;
/** A file's text, or `undefined` when it does not exist. */
export declare function readOptional(fs: UsageFileSystem, path: string): Promise<string | undefined>;
/**
 * Replace `path` with `data` atomically: a temp file in the same directory,
 * then a rename, so a reader or a crash never sees a partial file. The temp
 * file is removed when the write fails.
 */
export declare function writeAtomic(fs: UsageFileSystem, path: string, data: string): Promise<void>;
/** Lock timing, in ms. */
export interface LockTiming {
    /** A lock older than this (strictly) is stale and taken over. */
    staleMs: number;
    /** How often a waiting caller re-tries a held lock. */
    pollMs: number;
}
/**
 * An exclusive-create lock file with a staleness limit. It serialises the read-merge-write of
 * one file between DSH processes sharing one home; within one process the
 * store already runs its saves one at a time.
 */
export declare class UsageLock {
    private readonly fs;
    private readonly path;
    private readonly now;
    private readonly timing;
    constructor(fs: UsageFileSystem, path: string, now: () => number, timing: LockTiming);
    /**
     * Take the lock, waiting up to `waitMs` for a held one (polling), and
     * taking over one that is stale. A taken-over live lock is the accepted
     * worst case (see `USAGE_LOCK_STALE_MS`).
     * @returns the release function, or `undefined` when the lock stayed held.
     */
    acquire(waitMs?: number): Promise<(() => Promise<void>) | undefined>;
    private tryCreate;
    /**
     * Whether the lock file still holds `judged`, the record found stale.
     * Two waiters can judge one dead lock stale together; this check stops
     * the second from removing the fresh lock the first has just created. It
     * narrows that race to the instant between this read and the `rm`, and
     * does not close it: a file system with no compare-and-delete can't.
     * The rest is the takeover worst case of `USAGE_LOCK_STALE_MS`.
     */
    private unchanged;
    /** The held lock's age; a lock written only partly (a crash) is dated by its file time. A vanished lock is age 0: re-try. */
    private age;
    private read;
    /** Remove the lock only if it is still ours: a process that took it over as stale keeps its own. */
    private release;
}
/**
 * The lock `<dir>/<name>.lock`. Every writer of one provider's files (the
 * window store, the pre-tracking writer, a clear's purge) takes the same
 * lock, so a clear and a write never interleave.
 */
export declare function usageLock(fs: UsageFileSystem, dir: string, name: string, now: () => number, staleMs: number): UsageLock;
/** How long a waiting caller waits for a held lock: long enough for a lock held from the start to turn stale. */
export declare function usageLockWaitMs(staleMs: number): number;
/**
 * `<dir>/meta.json`, or `undefined` when it does not exist.
 * @throws when it exists but is not a valid meta file.
 */
export declare function readUsageMeta(fs: UsageFileSystem, dir: string): Promise<UsageMeta | undefined>;
/**
 * Resolve after `ms`. The timer keeps the process alive: the lock waits
 * are bounded, and at shutdown an unref'd wait would let Node exit
 * mid-wait with the pending sums neither written nor reported.
 * @returns the wait, and `cancel`, which resolves it at once and clears the timer.
 */
export declare function sleep(ms: number): Promise<void> & {
    cancel: () => void;
};
