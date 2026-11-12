import type { ProviderUsage, UsageWindow } from './common.js';
import type { ProviderId } from '../auth/store.js';
import type { ConcretePoolMember } from './pool-family.js';
/** Near-full members are tried only after members below this fill level. */
export declare const QUOTA_FULL_PERCENT = 95;
/** Exhausted subscription windows must not silently spill over into paid credits. */
export declare const QUOTA_EXHAUSTED_PERCENT = 100;
/** How long a usage snapshot is trusted before a background refresh. */
export declare const USAGE_TTL_MS: number;
/** The scheduling view of one member's quota. */
export interface MemberQuota {
    /** False when a window is near-full or the login is gone. */
    available: boolean;
    /** A known exhausted window: exclude even if the upstream would accept paid credits. */
    exhausted?: true;
    /** Burn rate in strategy-specific units; 0 when unmeasured. */
    urgency: number;
    /** Epoch ms of the snapshot this was computed from; 0 when none. */
    fetchedAt: number;
}
/**
 * Per-ACCOUNT usage snapshots with in-flight dedupe and
 * stale-while-revalidate refresh. Providers without a usage endpoint
 * (copilot) resolve no fetcher and score a constant zero urgency — which
 * naturally ranks them behind every measured member. Fetchers are resolved
 * lazily per (provider, account) so accounts added after startup join
 * tracking on their first score.
 */
export declare class PoolUsageTracker {
    private readonly fetcherFor;
    private readonly ttlMs;
    private readonly entries;
    private readonly inflight;
    constructor(fetcherFor: (provider: ProviderId, account: string) => (() => Promise<ProviderUsage>) | undefined, ttlMs?: number);
    /**
     * The quota view of one member. A cold cache awaits the first fetch; a
     * stale non-exhausted snapshot answers immediately while refreshing in the
     * background. Exhausted snapshots await their expired-cache refresh so a
     * reset can restore routing on this call. A live failure cooldown never
     * triggers another fetch.
     *
     * Failures discard stale urgency but preserve known exhaustion: an outage
     * must not turn a blocked subscription into permission to spend credits.
     * Only a successful usage lookup (or explicit invalidation) clears it.
     * @param member - the pool member to score (account resolved).
     * @returns availability plus the urgency score.
     */
    quotaFor(member: ConcretePoolMember, normalized?: boolean): Promise<MemberQuota>;
    /** Keep a known credit-spending risk blocked through usage-endpoint failures. */
    private failedQuota;
    /**
     * Same cache as {@link quotaFor}, for direct display (the Settings page):
     * the raw snapshot, or the original fetch error, instead of a routing
     * score.
     * @param provider - the account's provider.
     * @param account - the account key.
     * @param force - bypass a fresh cached SNAPSHOT for an honest re-check (the
     *   manual Refresh button). A live failure cooldown is never bypassed —
     *   retrying through it is exactly what turns a 429 into a permanent
     *   lockout, so even a forced call still answers from the negative cache.
     * @returns `{ supported: false }` when the provider has no usage fetcher.
     */
    snapshotFor(provider: ProviderId, account: string, force?: boolean): Promise<ProviderUsage>;
    /**
     * Store a snapshot the provider pushed on its own (Muse reports usage at the
     * start of every response stream), as fresh as a completed fetch. A snapshot
     * without a plan keeps the plan already on record.
     */
    record(provider: ProviderId, account: string, snapshot: ProviderUsage): void;
    /** Decorate a copy for UI consumers; raw snapshots and routing stay unchanged. */
    displaySnapshotFor(provider: ProviderId, account: string, force?: boolean): Promise<ProviderUsage>;
    /** Recheck after an inference quota failure without erasing another model lane's exhaustion. */
    expire(provider: ProviderId, account: string): void;
    /** Drop cached snapshots: one account, or a whole provider when `account` is omitted. */
    invalidate(provider: ProviderId, account?: string): void;
    /**
     * Run (or join) the single in-flight fetch for one account key, caching
     * either outcome. A missing/invalid credential is deliberately NOT
     * negative-cached: it costs no network round trip (the session lookup
     * fails before the request goes out) and re-checking live means the
     * member rejoins routing the instant its login is fixed, rather than
     * waiting out a stale cooldown.
     */
    private refresh;
    /** Score one member against a snapshot's windows. */
    private score;
}
/** Dimensionless urgency for the opt-in strategy. Missing timing adds no reset bonus. */
export declare function normalizedWindowUrgency(window: UsageWindow, now: number): number;
