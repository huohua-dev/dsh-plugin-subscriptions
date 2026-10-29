import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client';
import type { SubscriptionsKey } from './locales.js';
export { callSubscriptionsAuth } from './subscriptions-rpc.js';
/** Subscription provider ids, fixed by the node half's OAuth adapters. */
export type SubscriptionProvider = 'codex' | 'claude' | 'grok' | 'copilot' | 'antigravity' | 'muse';
/** One logged-in account as answered by the `status` endpoint. */
export interface AccountStatus {
    key: string;
    account?: string;
    expiresAt?: number;
    plan?: string;
    isDefault: boolean;
}
/** One provider's login state as answered by the `status` endpoint. */
export interface ProviderStatus {
    /** Picker selection; absent follows discovery, [] hides all model quotas. */
    visibleModels?: string[];
    displayName?: string;
    busy: boolean;
    accounts: AccountStatus[];
    /** Device-flow code the live attempt waits on, for the code card. */
    pendingLogin?: {
        userCode: string;
        verificationUrl: string;
    };
    detail?: string;
    /** The CLI version the route presents (Codex, Claude), and where it came from. */
    clientVersion?: {
        version: string;
        source: ClientVersionSource;
    };
}
export type ClientVersionSource = 'npm' | 'local' | 'fallback' | 'config';
/** One rate-limit window as answered by the `usage` endpoint. */
export interface UsageWindow {
    kind: 'session' | 'weekly' | 'other';
    scope?: string;
    usedPercent: number;
    resetsAt?: number;
}
/** `usage` endpoint value: the node half owns this shape. */
export interface ProviderUsage {
    supported: boolean;
    windows?: UsageWindow[];
    plan?: string;
    resetCredits?: {
        id?: string;
        grantedAt?: number;
        expiresAt?: number;
    }[];
    resetCreditsError?: string;
}
/** One model's default-effort picker state as answered by `modelDefaults`. */
export interface ModelDefaultView {
    id: string;
    name: string;
    /** Advertised effort levels, in catalog order (empty when the model has no reasoning). */
    efforts: {
        id: string;
        name: string;
    }[];
    /** The user-configured default effort, when set. */
    configured?: string;
}
/** `modelDefaults` endpoint value: one provider's picker state. */
export interface ModelDefaultsCatalog {
    provider: SubscriptionProvider;
    models: ModelDefaultView[];
}
/** `proxyGet` endpoint value: the node half owns this shape (no secrets). */
export interface ProxyConfigView {
    enabled: boolean;
    url: string;
    username?: string;
    passwordSet: boolean;
    bypass: string[];
    error?: string;
}
/** `proxyTest` endpoint value. */
export interface ProxyTestResult {
    ok: boolean;
    viaProxy: boolean;
    status?: number;
    latencyMs?: number;
    error?: string;
}
/** Injected dependencies of {@link SubscriptionsSection} (slot `inject`). */
export interface SubscriptionsSectionInjected {
    /** Generic logical-RPC caller over the Connection transport. */
    rpc: ConnectionHandle['rpc'];
    /** Section copy: translate a 'settings.subscriptions' key with `{name}` template params. */
    t: (key: SubscriptionsKey, params?: Record<string, unknown>) => string;
}
/**
 * Props delivered by the slot outlet: the inject face spread flat (the
 * renderer erases the share boundary at the render call).
 */
export type SubscriptionsSectionProps = Partial<SubscriptionsSectionInjected>;
/** A device-flow code the page shows while the attempt waits for it. */
export interface PendingDeviceCode {
    /** Short code the user types at (or confirms on) the verification page. */
    userCode: string;
    /** Page the user opens to authorize. */
    verificationUrl: string;
}
/**
 * The device code to render for one provider: what this page learned from its
 * own `login` answer first, then what the server still reports. The local copy
 * answers instantly; the reported one is what survives a reload of the
 * Settings page, after which the local one is gone but the attempt is not.
 * @param status - the provider's last reported state, possibly absent.
 * @param local - the code this page received from its own login attempt.
 * @returns the code to show, or `undefined` when no attempt is waiting.
 */
export declare function pendingDeviceCode(status: ProviderStatus | undefined, local: PendingDeviceCode | undefined): PendingDeviceCode | undefined;
/** The CLI version a route presents, beside the provider name; nothing for routes without one. */
export declare function ClientVersionTag({ clientVersion, t }: {
    clientVersion: ProviderStatus['clientVersion'];
    t: SubscriptionsSectionInjected['t'];
}): import("react").JSX.Element | null;
/** Bar fill color: success normally, warn from 80%, error from 95%. Shared with the composer badge. */
export declare function usageBarColor(usedPercent: number): string;
/** What one provider's collapsible default-effort section renders. */
export interface ModelDefaultsView {
    /** Models with reasoning levels, after the name filter — one row each. */
    shown: ModelDefaultView[];
    /** Models with reasoning levels before filtering (the header total). */
    total: number;
    /** How many of those carry a user override (the header count). */
    overridden: number;
    /** Models without reasoning levels: one count line, never a row each. */
    withoutEfforts: number;
    /** Whether the list is long enough to deserve a filter box. */
    showFilter: boolean;
}
/**
 * Derive one provider's default-effort section from its catalog and filter.
 * Pure so the collapsed-header counts and the filter stay testable without a
 * DOM: rows come only from models that advertise levels, the count of the rest
 * rides as one line, and the filter matches display name or model id.
 * @param models - the provider's catalog models, or undefined while loading.
 * @param filter - the raw filter input (trimmed and lowercased here).
 * @returns the section's rows and header counts.
 */
export declare function deriveModelDefaultsView(models: readonly ModelDefaultView[] | undefined, filter: string): ModelDefaultsView;
/** Inputs of the default-effort fetch decision (see {@link shouldFetchModelDefaults}). */
export interface ModelDefaultsFetchInput {
    /** Providers that currently have at least one account. */
    loggedIn: readonly SubscriptionProvider[];
    /** Providers whose disclosure is open. */
    open: readonly SubscriptionProvider[];
    /** The account signature the last completed fetch was answered for. */
    loadedFor: string | undefined;
    /** The account signature of the current status snapshot. */
    signature: string;
    /** Whether the last attempt failed (a failure latches until Retry). */
    failed: boolean;
}
/**
 * Whether the default-effort catalog needs (re)fetching.
 *
 * Fetching is gated on an *attempt* signature rather than on the payload
 * being empty: an empty answer is a legitimate result (a narrowed
 * `config.providers`, or a catalog that is momentarily unavailable), and
 * treating it as "not loaded yet" re-ran this effect forever. The signature
 * also covers the accounts, so logging a second provider in refetches
 * instead of leaving that card on the previous answer.
 * @param input - the decision inputs.
 * @returns true when the caller should start a fetch.
 */
export declare function shouldFetchModelDefaults(input: ModelDefaultsFetchInput): boolean;
/**
 * Stable signature of the accounts a catalog answer depends on. A change
 * means a previous answer is stale (an account arrived or left), so the next
 * open disclosure refetches.
 * @param statuses - the per-provider status snapshot.
 * @returns a signature string, stable across renders with equal accounts.
 */
export declare function modelDefaultsSignature(statuses: Partial<Record<SubscriptionProvider, ProviderStatus>>): string;
/**
 * Whether a provider's login attempt has settled, i.e. nothing is waiting on
 * the authorization server any more — the poll loop has served its purpose
 * and the device-code card can go.
 *
 * Only `busy` decides this. The server keeps a provider busy for the whole
 * attempt *and* the exchange + store write that follows it, so a settled
 * attempt always has its session (or its error) already in the status the poll
 * just read. The account list must not take part: reading "it has accounts" as
 * "the attempt finished" made adding a *second* account end one poll tick in —
 * the first account was already there, so the card lost the user code and the
 * "open the page" button within ~2s and the poller stopped, leaving a login
 * that finished in the browser invisible until the page was reloaded.
 * @param status - the provider's last reported state.
 * @returns true when no login attempt is running for the provider.
 */
export declare function attemptSettled(status: ProviderStatus): boolean;
/**
 * The Subscriptions settings page component.
 * @param props - the slot inject face ({@link SubscriptionsSectionInjected}).
 * @returns the section body, or a notice while the RPC face is absent.
 */
export declare function SubscriptionsSection(props: SubscriptionsSectionProps): import("react").JSX.Element;
