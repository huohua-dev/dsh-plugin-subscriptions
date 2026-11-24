import type { UsageChunk } from '../providers/replay.js';
import type { HostTokenUsage } from './host-events.js';
import type { TokenCounts } from './window-tracker.js';
/** Copy only the token buckets reported by DSH. No message or request data is retained. */
export declare function usageCounts(usage: HostTokenUsage): TokenCounts;
export declare function requestCounts(chunk: UsageChunk): TokenCounts;
/** Keep the actual model id, not the account-prefixed picker alias. */
export declare function servedModel(model: string): string;
