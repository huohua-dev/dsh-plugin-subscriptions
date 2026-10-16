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

import type { LlmModelInfo, LlmResolvedModelInfo, GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ProviderId } from '../auth/store.js'
import { runWithAccountProxy, withAccountProxy } from '../http.js'
import type { AccountRoute } from '../http.js'
import type { AccountAwareAdapter } from './accounts.js'

function routeOf(provider: ProviderId, account: string | undefined): AccountRoute | undefined {
  return account === undefined ? undefined : { provider, account }
}

/**
 * Run one account-scoped call inside its proxy scope.
 * @param provider - the subscription the account belongs to.
 * @param account - the account key; `undefined` (the union/default path) runs unscoped.
 * @param body - the call to make.
 * @returns whatever `body` returns.
 */
export function accountScoped<T>(
  provider: ProviderId,
  account: string | undefined,
  body: () => T,
): T {
  const route = routeOf(provider, account)
  return route === undefined ? body() : runWithAccountProxy(route, body)
}

/**
 * Wrap an adapter so every account it names is routed through that account's
 * own proxy. The raw adapter is used for the calls themselves, so a wrapper
 * never re-enters itself.
 * @param provider - the subscription this adapter serves.
 * @param adapter - the raw provider adapter.
 * @returns the same adapter with its account-scoped calls scoped.
 */
export function withAccountProxyScope(provider: ProviderId, adapter: AccountAwareAdapter): AccountAwareAdapter {
  return new Proxy(adapter, {
    get(target, property) {
      if (property === 'streamAccount') {
        return (options: GenerateOptions, account: string): AsyncIterable<StreamChunk> =>
          withAccountProxy({ provider, account }, adapter.streamAccount(options, account))
      }
      if (property === 'listOwnModels') {
        return (
          route: string,
          account?: string,
          signal?: AbortSignal,
          preferCached?: boolean,
        ): Promise<readonly LlmModelInfo[]> => accountScoped(
          provider, account, () => adapter.listOwnModels(route, account, signal, preferCached),
        )
      }
      if (property === 'resolveOwnModel') {
        return (route: string, model: string, account?: string): Promise<LlmResolvedModelInfo> => accountScoped(
          provider, account, () => adapter.resolveOwnModel(route, model, account),
        )
      }
      const value = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}