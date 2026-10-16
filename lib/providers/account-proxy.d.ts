/**
 * Per-account proxy scope. Every account-scoped call an adapter makes — the
 * model stream, its token refresh, per-account catalog discovery — leaves
 * through a proxy saved on that account, while accounts without one keep the
 * plugin-wide routing.
 *
 * The scope is applied by wrapping the adapter once, at registration, rather
 * than at every call site: providers reach the network through a module-level
 * `proxiedFetch`, so the account has to travel on the async context (see
 * `src/http.ts`) instead of through their signatures.
 */
import type { ProviderId } from '../auth/store.js';
import type { AccountAwareAdapter } from './accounts.js';
/**
 * Run one account-scoped call inside its proxy scope.
 * @param provider - the subscription the account belongs to.
 * @param account - the account key; `undefined` (the union/default path) runs unscoped.
 * @param body - the call to make.
 * @returns whatever `body` returns.
 */
export declare function accountScoped<T>(provider: ProviderId, account: string | undefined, body: () => T): T;
/**
 * Wrap an adapter so every account it names is routed through that account's
 * own proxy. The raw adapter is used for the calls themselves, so a wrapper
 * never re-enters itself.
 * @param provider - the subscription this adapter serves.
 * @param adapter - the raw provider adapter.
 * @returns the same adapter with its account-scoped calls scoped.
 */
export declare function withAccountProxyScope(provider: ProviderId, adapter: AccountAwareAdapter): AccountAwareAdapter;
