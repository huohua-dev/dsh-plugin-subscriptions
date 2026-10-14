/**
 * Meta Muse Code subscription provider.
 *
 * Login is the Muse CLI's own OAuth device flow against auth.meta.com (public
 * client id from the official `muse` launcher). The granted Meta OIDC identity
 * token is then exchanged at `api.meta.ai/muse-code/key` for a Model API key
 * (`LLM|…`), which is the only credential the Model API accepts — the identity
 * token itself answers 401 there. The mint is idempotent (it returns the same
 * key while the key is valid) and its response also carries the account email,
 * the subscription tier, and the 5-hour/weekly usage windows, so it doubles as
 * this provider's usage endpoint.
 *
 * Inference speaks the OpenAI Responses wire on `api.meta.ai/v1/responses`,
 * shaped like the Muse CLI's own requests: `reasoning.summary: auto`,
 * `include: [reasoning.encrypted_content]`, `store: false`, a prompt-cache key
 * and the CLI's client/session headers. Completed reasoning items of a
 * tool-calling response ride the harness replay envelope so the model keeps
 * its chain of thought across a tool round trip.
 *
 * References: the `muse` launcher script (device flow, client id), Wraient/
 * muse-cc (wire surfaces, accepted efforts), and diegosouzapw/OmniRoute
 * PRs #13634 / #14267 (key mint contract).
 */
import { LlmAdapter } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { DeviceFlowSpec } from '../auth/device-flow.js';
import type { MuseSession } from '../auth/store.js';
import type { ReasoningReplayItem, ResponsesRequestInput } from '../translate/responses.js';
import type { CatalogPersistence, DiscoveredModel, FetchFn, ModelEntry, ProviderUsage } from './common.js';
import { AccountTokenManager } from './accounts.js';
import type { PoolAdapter } from './pool.js';
import type { RateLimitResetReader, RateLimitWait } from './rate-limit.js';
/** Public OAuth client id of the Muse Code CLI (from the official `muse` launcher). */
export declare const MUSE_CLIENT_ID = "1031625952748946";
export declare const MUSE_DEVICE_CODE_URL = "https://auth.meta.com/oidc/device/authorization/";
export declare const MUSE_DEVICE_TOKEN_URL = "https://auth.meta.com/oidc/device/token/";
/** Exchanges the OIDC identity token for the Model API key (and reports tier + usage). */
export declare const MUSE_KEY_URL = "https://api.meta.ai/muse-code/key";
export declare const MUSE_API_URL = "https://api.meta.ai/v1/responses";
export declare const MUSE_MODELS_URL = "https://api.meta.ai/v1/models";
/** Muse CLI release this plugin presents itself as (user agent only). */
export declare const MUSE_CLI_VERSION = "1.4.7";
/**
 * Re-mint cadence. Meta does not disclose a key lifetime; integrations treat
 * the key as daily, and a re-mint of a still-valid key returns it unchanged,
 * so refreshing daily is free.
 */
export declare const MUSE_KEY_TTL_MS: number;
/** Refresh when the key has less than this much of its assumed life left. */
export declare const MUSE_PREEMPT_MS: number;
/** Reads the reset instant of a rejected Meta window from the error body. */
export declare const museRateLimitReset: RateLimitResetReader;
/** User agent of a headless Muse CLI run on this machine. */
export declare function museUserAgent(os?: string, cpu?: string): string;
/**
 * The device-flow facts for the auth controller's DeviceFlowManager. Meta's
 * device endpoint takes the client id alone (no scope) and returns a
 * `verification_uri_complete` that already carries the user code.
 */
export declare function museDeviceFlow(): DeviceFlowSpec;
/** One usage window of the mint response's `subs_usage`. */
interface MuseUsageWindowWire {
    used_percent?: number;
    window_duration_mins?: number;
    /** Epoch SECONDS at which the window resets. */
    resets_at?: number;
}
/** The mint response subset this plugin reads. */
export interface MuseKeyResponse {
    api_key?: string;
    base_url?: string;
    user_email?: string;
    user_full_name?: string;
    is_subs_active?: boolean;
    require_payment?: boolean;
    action_url?: string | null;
    subs_tier_name?: string;
    subs_usage?: {
        window?: MuseUsageWindowWire;
        weekly?: MuseUsageWindowWire;
        tier?: string;
    };
}
/**
 * Exchange the Meta identity token for the Model API key. A 401/403 means
 * the identity is revoked or expired — permanent, re-login required.
 * @param identityToken - the OIDC identity token from the device flow.
 * @param fetchFn - fetch implementation (injectable for tests).
 * @param signal - caller cancellation.
 * @returns the parsed mint response (with a non-empty `api_key`).
 */
export declare function mintMuseKey(identityToken: string, fetchFn?: FetchFn, signal?: AbortSignal): Promise<MuseKeyResponse & {
    api_key: string;
}>;
/**
 * Complete a device-flow login: mint the Model API key and read the account
 * identity from the same response.
 * @param identityToken - the Meta OIDC identity token the device flow released.
 * @param fetchFn - fetch implementation (injectable for tests).
 * @returns the session to store.
 */
export declare function completeMuseLogin(identityToken: string, fetchFn?: FetchFn): Promise<MuseSession>;
/**
 * Refresh a muse session: re-mint the Model API key from the identity token.
 * @param session - the stored session.
 * @param fetchFn - fetch implementation (injectable for tests).
 * @returns the fresh session to store.
 */
export declare function refreshMuse(session: MuseSession, fetchFn?: FetchFn): Promise<MuseSession>;
/**
 * Whether a muse refresh failure means the login is permanently gone.
 * @param error - the thrown refresh error.
 * @returns true when the identity token was rejected (re-login required).
 */
export declare function isMusePermanentRefreshError(error: unknown): boolean;
/**
 * Map a mint response's subscription usage to the usage RPC shape. The short
 * window is the 5-hour session window (`window_duration_mins: 300`); any other
 * duration is reported as `other` rather than mislabelled.
 */
export declare function museUsageFromKey(minted: MuseKeyResponse): ProviderUsage;
/**
 * Fetch the subscription usage through the (idempotent) key mint.
 * @param session - the stored session (its identity token authorizes the mint).
 * @param fetchFn - fetch implementation (injectable for tests).
 * @param signal - caller cancellation from the RPC transport.
 * @returns the mapped usage snapshot.
 */
export declare function fetchMuseUsage(session: MuseSession, fetchFn?: FetchFn, signal?: AbortSignal): Promise<ProviderUsage>;
/** Display name for a model id the catalog does not name (`muse-spark-1.3-contributor` → `Muse Spark 1.3 Contributor`). */
export declare function museModelName(id: string): string;
/**
 * Fetch the live model list. An empty list from a 200 response is a discovery
 * failure (the static catalog then serves), matching the Muse CLI, which ships
 * built-in models and treats the server catalog as an overlay.
 * @param session - the stored session (used as-is; never refreshed here).
 * @param fetchFn - fetch implementation (injectable for tests).
 * @param signal - caller cancellation.
 * @returns discovered chat models in endpoint order.
 */
export declare function fetchMuseModels(session: MuseSession, fetchFn?: FetchFn, signal?: AbortSignal): Promise<DiscoveredModel[]>;
/** Replay envelope marker and payload: one tool-calling response's reasoning. */
export interface MuseReplayResponse {
    kind: 'muse';
    version: 1;
    /** Account key that produced the encrypted payloads (they are credential-bound). */
    account?: string;
    /** Function-call ids this response emitted. */
    calls: string[];
    /** Completed reasoning items, replayed ahead of the first of those calls. */
    reasoning: ReasoningReplayItem[];
}
/**
 * Index the replayable reasoning of earlier assistant turns by call id. Only
 * turns this route produced for the same model and account qualify: encrypted
 * reasoning is bound to the model and credential that minted it. Every call
 * of one response maps to the SAME array, which `toResponsesInput` dedupes by
 * reference so parallel calls replay the items once.
 */
export declare function museReasoningIndex(messages: GenerateOptions['messages'], provider: string, model: string, account: string | undefined): Map<string, readonly ReasoningReplayItem[]>;
/**
 * Build one Muse Responses request body (exported for tests). Mirrors the Muse
 * CLI: Meta's `tool_choice` supports only `auto`, efforts ride
 * `reasoning.effort` with an `auto` summary, and the encrypted reasoning is
 * requested so tool round trips can replay it.
 */
export declare function museRequestBody(options: GenerateOptions, resolved: ResponsesRequestInput): Record<string, unknown>;
/** Request headers presenting a headless Muse CLI run. */
export declare function museHeaders(apiKey: string, sessionId: string | undefined): Record<string, string>;
/** Constructor dependencies for {@link MuseAdapter}. */
export interface MuseAdapterOptions {
    models: readonly ModelEntry[];
    streamIdleTimeoutMs: number;
    tokens: AccountTokenManager<MuseSession>;
    /** Late-bound pool facade (wired after adapter construction). */
    pool?: () => PoolAdapter | undefined;
    /** Whether to fetch the live catalog when logged in (false when config `models` overrides). */
    discovery: boolean;
    /** Warning sink for discovery failures that fall back to the static catalog. */
    onWarn?: (message: string) => void;
    /** Fetch implementation (defaults to the proxy-aware fetch). */
    fetchFn?: FetchFn;
    /** Resolve the attachment service per request; absent means image requests fail loudly. */
    resolveAttachments?: () => AttachmentStore | undefined;
    /** Durable catalog store seeding capability metadata across restarts. */
    catalogStore?: CatalogPersistence;
    onCatalogChanged?: () => void;
    accountCatalogStore?: (account: string) => CatalogPersistence;
    /** Per-model default reasoning effort override (the Settings page's picker). */
    defaultEffortOf?: (model: string) => string | undefined;
    /** How long this route may hold a turn open waiting for a rate-limit window. */
    rateLimit?: RateLimitWait;
}
/** Muse wire adapter: one instance serves the `muse` provider route. */
export declare class MuseAdapter extends LlmAdapter {
    private readonly options;
    private readonly catalog;
    private readonly accountCatalogs;
    private accountCatalogsInvalidated;
    private readonly invalidatedAccounts;
    private catalogOwner;
    constructor(options: MuseAdapterOptions);
    private get fetchFn();
    private fetchCatalog;
    /** Drop cached catalogs after login/logout so the next list does not reuse a stale plan. */
    clearAccountCatalog(account?: string): void;
    private catalogFor;
    private modalities;
    private listed;
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(provider: string): import("@deepseek-ai/dsh-llm").ResolvedRetryPolicy;
    private staticModels;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /** The provider's own catalog: union of every account, or one account when named. */
    listOwnModels(provider: string, account?: string, signal?: AbortSignal, preferCached?: boolean): Promise<readonly LlmModelInfo[]>;
    private discovered;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    /** Capability resolution of the provider's own models (the pool resolves members here). */
    resolveOwnModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /** Pool seam: stream through one specific account instead of the default. */
    streamAccount(options: GenerateOptions, account: string): AsyncIterable<StreamChunk>;
    private streamCore;
    private request;
}
export {};
