import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
import type { ProviderUsage } from './SubscriptionsSection.js';
type Rpc = ConnectionHandle['rpc'];
type Listener = (key: string, usage: ProviderUsage) => void;
export declare function readUsageCache(rpc: Rpc, key: string): ProviderUsage | undefined;
export declare function publishUsage(rpc: Rpc, key: string, usage: ProviderUsage): void;
export declare function failUsage(rpc: Rpc, key: string): void;
export declare function subscribeUsage(rpc: Rpc, listener: Listener): () => void;
/** Called after a status read so logout cannot leave recoverable account history. */
export declare function retainUsageAccounts(rpc: Rpc, live: Set<string>): void;
export {};
