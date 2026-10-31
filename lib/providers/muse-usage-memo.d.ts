/**
 * Last-known Muse Code subscription usage per account, persisted at
 * `~/.dsh/plugins/subscriptions/muse-usage.json`.
 *
 * Meta's key mint — the only usage source that costs no quota — reports usage
 * only while a 5-hour window is running. Once an account sits idle past that,
 * the mint is silent about the weekly lane too, so the Settings page had
 * nothing to show (and its Refresh button nothing to refresh) until the
 * account was used again. The weekly lane cannot move without a request, and
 * every request reports usage (stream frame) and reopens the mint's report,
 * so the last value Meta disclosed is exact until its reset.
 *
 * This file is a cache: a missing, corrupt, or malformed file reads as empty,
 * and writes are best effort.
 */
import type { MuseSubscriptionUsageWire, MuseUsageMemory } from './muse.js';
/** Absolute path of the usage memo file. */
export declare function museUsageFilePath(): string;
/** Per-account usage memo over one JSON file. */
export declare class MuseUsageMemo {
    private readonly path;
    /** Usage reported in this process; wins over whatever the file held. */
    private readonly reported;
    private disk;
    private writes;
    constructor(path?: string);
    /** The memory view the usage fetcher of one account reads and feeds. */
    forAccount(account: string): MuseUsageMemory;
    /** The last usage Meta reported for the account, if any. */
    recall(account: string): Promise<MuseSubscriptionUsageWire | undefined>;
    /**
     * Record a usage report. A report missing one lane keeps the remembered
     * value of that lane. Persisted in the background; a failed write only
     * costs the memo across a restart.
     */
    remember(account: string, usage: MuseSubscriptionUsageWire): void;
    /** Settle pending writes (tests). */
    flush(): Promise<void>;
    private load;
    private persist;
}
