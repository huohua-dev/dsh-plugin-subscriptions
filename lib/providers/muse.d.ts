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
import type { GenerateOptions, LlmModelInfo, LlmProviderInfo, LlmResolvedModelInfo, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { DeviceFlowSpec } from '../auth/device-flow.js';
import type { MuseSession } from '../auth/store.js';
import type { ImageRequestLimit } from '../translate/resolved.js';
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
/** The Muse CLI's catalog: per-model limits, modalities, efforts, visibility. */
export declare const MUSE_MODELS_URL = "https://api.meta.ai/muse-code/models";
/**
 * Muse CLI release this plugin presents itself as (user agent only). The
 * builtin tool declarations in {@link MUSE_BUILTIN_TOOL_NAMESPACE} are the
 * ones that release sends; move both together.
 */
export declare const MUSE_CLI_VERSION = "1.4.14";
/**
 * Re-mint cadence. Meta does not disclose a key lifetime; integrations treat
 * the key as daily, and a re-mint of a still-valid key returns it unchanged,
 * so refreshing daily is free.
 */
export declare const MUSE_KEY_TTL_MS: number;
/** Refresh when the key has less than this much of its assumed life left. */
export declare const MUSE_PREEMPT_MS: number;
/**
 * Cap on each image a Muse request carries. Every step resends the whole
 * history with its images inline, so they pile up: a session holding twenty
 * 1440×704 frame strips stored as 1.2–1.8 MB PNGs sent 31 MB of base64 on
 * every step. Meta starts the stream only after it has read and processed
 * every image (seconds per image), and through a proxied link 3 of 7 such
 * requests had the connection closed before the stream started (undici
 * `other side closed`), which surfaced as TRANSPORT failures. Over this cap an
 * image is re-encoded by the host (JPEG q85 for opaque images; the stored
 * attachment is untouched): the same history became 5.4 MB, and 7 of 7
 * requests on the same link succeeded.
 */
export declare const MUSE_IMAGE_LIMIT: ImageRequestLimit;
/**
 * Inline image data a Muse request may carry, in base64 bytes. Past it the
 * host offloads the oldest images to text and retries, so a long image-heavy
 * session cannot grow the upload without bound.
 */
export declare const MUSE_REQUEST_IMAGE_BUDGET: number;
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
/**
 * Subscription usage as Meta reports it: the mint response's `subs_usage`,
 * and the `subscription` of the `response.subscription_usage` frame that
 * opens every inference stream.
 */
export interface MuseSubscriptionUsageWire {
    window?: MuseUsageWindowWire;
    weekly?: MuseUsageWindowWire;
    tier?: string;
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
    /**
     * Present only while a 5-hour window is running. A window opens with the
     * first request after the previous one lapsed, so an account left idle for
     * five hours mints with no `subs_usage` at all — the weekly lane included,
     * even when part of it is spent (live-verified 2026-10-31: an idle mint
     * omitted it, one request later the stream and the mint both reported
     * weekly 67%).
     */
    subs_usage?: MuseSubscriptionUsageWire;
}
/**
 * Per-account memory of the last usage Meta disclosed (mint or stream), so an
 * idle account's weekly lane stays known while the mint is silent about it.
 */
export interface MuseUsageMemory {
    recall(): Promise<MuseSubscriptionUsageWire | undefined>;
    remember(usage: MuseSubscriptionUsageWire): void;
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
 * Map one reported subscription usage (mint or stream) to the usage RPC shape.
 * @param wire - the `subs_usage` / `subscription` object.
 * @param plan - the tier name to show, when known.
 */
export declare function museUsageFromWire(wire: MuseSubscriptionUsageWire | undefined, plan?: string): ProviderUsage;
/**
 * The usage of an account whose mint reported no windows: no 5-hour window is
 * running, so that lane is unused (0%). The weekly lane cannot have moved since
 * Meta last reported it — any request would have opened a 5-hour window — so
 * the remembered value stands until its reset, and reads 0% after it.
 * @param remembered - the last usage Meta disclosed for the account, if any.
 * @param plan - the tier name to show, when known.
 * @param now - clock (tests pin it).
 */
export declare function museIdleUsage(remembered: MuseSubscriptionUsageWire | undefined, plan?: string, now?: number): ProviderUsage;
/**
 * Read the `subscription` of a `response.subscription_usage` stream frame.
 * @returns the reported usage, or undefined for any other event or a malformed frame.
 */
export declare function museStreamSubscriptionUsage(event: {
    type?: unknown;
    subscription?: unknown;
}): MuseSubscriptionUsageWire | undefined;
/**
 * Fetch the subscription usage through the (idempotent) key mint. An idle
 * account mints without any usage (see {@link MuseKeyResponse.subs_usage});
 * its windows then come from {@link museIdleUsage} instead of reading as
 * "no usage reported" until the account is used again.
 * @param session - the stored session (its identity token authorizes the mint).
 * @param fetchFn - fetch implementation (injectable for tests).
 * @param signal - caller cancellation from the RPC transport.
 * @param memory - the account's remembered usage (records what the mint reports).
 * @returns the mapped usage snapshot.
 */
export declare function fetchMuseUsage(session: MuseSession, fetchFn?: FetchFn, signal?: AbortSignal, memory?: MuseUsageMemory): Promise<ProviderUsage>;
/** Display name for a model id the catalog does not name (`muse-spark-1.3-contributor` → `Muse Spark 1.3 Contributor`). */
export declare function museModelName(id: string): string;
/**
 * Meta gates the model catalog on the caller's network: from some egress IPs
 * (commercial proxy exits among them) it answers an empty list on every call,
 * while the same key lists every model from another network. Inference from
 * such a network is refused for some models some of the time (see
 * {@link MUSE_BLOCKED_NETWORK_HINT}); the built-in catalog serves the picker.
 */
export declare const MUSE_NETWORK_HINT: string;
/**
 * Why an entitled model answers 404 `model_not_found` (live-verified with one
 * key across two egresses): a network Meta blocks (its catalog is empty there)
 * gets the 404, and every such rejection makes Meta refuse that model for the
 * whole account on every network — the Muse CLI on a clean VPS included — for
 * a few minutes, intermittently (about 3 minutes after a dozen rejections).
 * Catalog reads and served requests from the blocked network do not poison.
 */
export declare const MUSE_MODEL_NOT_FOUND_HINT: string;
/** Error code of a request refused because this network is blocked (not retried, does not park a pool member). */
export declare const MUSE_NETWORK_BLOCKED_CODE = "MUSE_NETWORK_BLOCKED";
/** Explanation attached to {@link MUSE_NETWORK_BLOCKED_CODE} failures. */
export declare const MUSE_BLOCKED_NETWORK_HINT: string;
/** Waits between retries of a `model_not_found` on an unblocked network (three retries, ~7 s). */
export declare const MUSE_MODEL_NOT_FOUND_BACKOFF_MS: readonly number[];
/**
 * Whether Meta answers this network an empty catalog (the blocked-network
 * signal). Reading the catalog does not poison the account.
 * @returns true for an empty list, false for a populated one, undefined when
 *   the probe itself failed (unknown).
 */
export declare function museCatalogEmpty(session: MuseSession, fetchFn?: FetchFn, signal?: AbortSignal): Promise<boolean | undefined>;
/**
 * Fetch the live model catalog the Muse CLI uses. Hidden entries and models
 * that cannot chat (image generation, voice) are dropped. An empty list from a
 * 200 response is a discovery failure (the static catalog then serves); it is
 * what Meta answers to a gated network (see {@link MUSE_NETWORK_HINT}).
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
 * Why a turn can end early on Muse. The model sometimes replies with one short
 * progress sentence that announces its next action ("now running the three
 * variants:") and then ends the response without making the tool call. The
 * stream is a normal `completed` response — no `phase`, `end_turn`, or status
 * marks it, and it is indistinguishable on the wire from a real final answer —
 * so the harness, which ends a turn at the first response without a tool call,
 * stops and waits for the user to type "continue".
 *
 * Measured against the real API with one recorded request replayed: at some
 * points of a long tool loop the model stops this way on most samples, at
 * others on a few percent. A persistence instruction in `instructions` and the
 * catalog's `temperature`/`top_p` defaults did not change that. What does work
 * is what the user does by hand, so the adapter does it once: it shows the
 * model its own reply followed by this notice, and keeps the answer only if it
 * makes a tool call.
 *
 * The notice asks the question before it offers the way out. A first draft
 * said "if the task is not finished, continue now"; on short replies that
 * really were final (a year, a hostname) it made the model add a needless tool
 * call once in 24 tries, where this wording added none in 24. Both continued
 * every real early stop.
 */
export declare const MUSE_DANGLING_STOP_NOTICE: string;
/**
 * Longest text-only reply the dangling-stop check looks at. In the recorded
 * Muse sessions every premature stop was 110 characters or fewer and every
 * real final answer after tool work was 428 or more.
 */
export declare const MUSE_DANGLING_STOP_MAX_CHARS = 300;
/**
 * Whether a text-only reply reads as "I am about to do something" rather than
 * as an answer. Only short, unstructured replies qualify: anything long, with
 * code, a table, or a list is a report, and a question or an offer to the user
 * is a deliberate hand-back. Of what is left, a trailing colon counts (the
 * promised content never followed), and so does an announced next step; a short
 * reply that neither announces nor claims to be finished is treated as dangling
 * too, because the cost of being wrong is one extra request whose answer is
 * dropped when the model really was done.
 * @param text - the reply's text blocks, joined.
 * @returns true when the turn most likely ended early.
 */
export declare function museDanglingText(text: string): boolean;
/**
 * Whether a reply to the user's own message only announces an action and ends.
 * Recorded 2026-10-17: the user typed "创建v0.2.2 tag", Muse answered "我来给
 * 当前已推送的提交创建 `v0.2.2` 标签并推送。" and stopped, so the user had to
 * type "继续". A reply to the user is normally an answer, so this path is
 * narrower than {@link museDanglingText}: the reply has to announce an action or
 * trail off with a colon, never merely be short. Mid-tool-loop replies keep the
 * broader rule.
 * @param text - the reply's text blocks, joined.
 * @returns true when the turn most likely ended early.
 */
export declare function museAnnouncesAction(text: string): boolean;
/**
 * Whether the model is in the middle of a tool loop: the newest real input is
 * a tool result, not something the user typed. DSH slips its own context
 * messages (time, instructions, catalogs) between the two as user-role
 * messages with another `source.kind`; those are skipped. A reply to a fresh
 * user message is checked by {@link museAnnouncesAction} instead: it counts only
 * when the reply itself announces an action.
 * @param messages - the request's messages.
 */
export declare function museMidToolLoop(messages: GenerateOptions['messages']): boolean;
/**
 * Usage of a step that took two requests. The kept response's request is the
 * context the next step starts from, so its input and cache counts stand; the
 * other response only adds the tokens it generated.
 */
export declare function museMergedUsage(kept: TokenUsage | undefined, other: TokenUsage | undefined): TokenUsage | undefined;
/** Prefix every Muse Code builtin tool name carries inside its `muse` namespace. */
export declare const MUSE_BUILTIN_TOOL_PREFIX = "muse.";
/**
 * Resolve the name of a tool call the model emitted. Muse's builtin calls
 * arrive namespaced (`muse.bash`); when this session declares the same tool at
 * the top level — this route does, for every harness tool — the un-namespaced
 * name is the one the harness can run. Any other namespaced name passes
 * through untouched, so a builtin this session does not declare fails as an
 * ordinary unknown tool instead of silently running something else.
 * @param name - the tool name as the model emitted it.
 * @param declared - names of the tools this request declares for the harness.
 * @returns the name the harness should see.
 */
export declare function museToolCallName(name: string, declared: ReadonlySet<string>): string;
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
/**
 * Request headers presenting a headless Muse CLI run. No DSH attribution:
 * its only header is a `user-agent`, which would replace the Muse CLI's.
 */
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
    /** Waits between retries of a transient `model_not_found` (tests shorten it). */
    modelNotFoundBackoffMs?: readonly number[];
    /**
     * Continue a turn the model ended right after announcing its next step, with
     * one extra request (default true; see {@link MUSE_DANGLING_STOP_NOTICE}).
     */
    continueDanglingStop?: boolean;
    /** Waits before each extra continuation attempt (tests shorten them). */
    continuationRetryMs?: readonly number[];
    /** Clock for the blocked-network recheck window (tests advance it). */
    now?: () => number;
    /**
     * Receives the subscription usage Meta reports at the start of every
     * response stream, keyed by the account that sent the request.
     */
    onSubscriptionUsage?: (account: string, usage: MuseSubscriptionUsageWire) => void;
}
/** Muse wire adapter: one instance serves the `muse` provider route. */
export declare class MuseAdapter extends LlmAdapter {
    private readonly options;
    private readonly catalog;
    private readonly accountCatalogs;
    private accountCatalogsInvalidated;
    private readonly invalidatedAccounts;
    private catalogOwner;
    private warnedEmptyCatalog;
    /** Account + model → when a request was last refused on a blocked network. */
    private readonly blockedAt;
    constructor(options: MuseAdapterOptions);
    private get fetchFn();
    private now;
    /**
     * The non-retryable failure of a request on a blocked network: refused by
     * Meta (`sent`, an HTTP 404) or held back by the pre-send check.
     */
    private blockedNetwork;
    private fetchCatalog;
    /** Drop cached catalogs after login/logout so the next list does not reuse a stale plan. */
    clearAccountCatalog(account?: string): void;
    private catalogFor;
    private modalities;
    private listed;
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(provider: string): import("@deepseek-ai/dsh-llm").ResolvedRetryPolicy;
    private staticModels;
    /** Every model this provider's accounts have listed, newest knowledge first. */
    private knownModels;
    /**
     * The catalog an account answers with when its live discovery failed. The
     * built-in list plus whatever another account of this provider has listed:
     * a gated network leaves this account's catalog UNKNOWN, not empty, and
     * answering with the built-in list alone lets it shrink account pools — one
     * gated login would keep a live model out of failover, so the one account
     * that could list it would face a closed window alone and report it as a
     * terminal quota error while healthy accounts sat idle. The union only grows
     * with models the provider is really serving, so it never widens the picker
     * beyond what some account has listed.
     */
    private fallbackModels;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /** The provider's own catalog: union of every account, or one account when named. */
    listOwnModels(provider: string, account?: string, signal?: AbortSignal, preferCached?: boolean): Promise<readonly LlmModelInfo[]>;
    /**
     * One live model-list request for this account, bypassing every cache and
     * every fallback (including the known catalog Meta gates some networks
     * with): the Settings probe must report what this account's own proxy
     * reached, and a stored or built-in catalog would say nothing.
     */
    probeOwnModels(provider: string, account: string, signal?: AbortSignal): Promise<readonly LlmModelInfo[]>;
    private discovered;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    /** Capability resolution of the provider's own models (the pool resolves members here). */
    resolveOwnModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /** Pool seam: stream through one specific account instead of the default. */
    streamAccount(options: GenerateOptions, account: string): AsyncIterable<StreamChunk>;
    private streamCore;
    /**
     * Whether a finished response may be the early end described at
     * {@link MUSE_DANGLING_STOP_NOTICE}: a short text-only reply from a request
     * that offered tools. In the middle of a tool loop the reply only has to not
     * read as a final answer; on the first step of a turn, where the newest input
     * is the user's message, it has to announce the action it never performs.
     */
    private endedEarly;
    /**
     * Ask the model once whether it meant to carry on after a short text-only
     * reply. The second request shows it its own reply followed by
     * {@link MUSE_DANGLING_STOP_NOTICE}; the notice itself never reaches the
     * conversation. If the answer makes a tool call it continues the first
     * response's message (block indexes carry on from it); a text-only answer
     * means the model really was done, so it is dropped unseen and the first
     * reply stands. The continuation is best effort: a failure before it has
     * produced output leaves the turn exactly as the model ended it, but a
     * transient transport failure is retried (see {@link MUSE_CONTINUATION_RETRY_MS})
     * because the route is flaky enough that the step's own request may retry too.
     * @returns the second response and whether it was kept, or undefined when
     *   the request itself failed.
     */
    private continueAfterAnnouncement;
    private request;
}
export {};
