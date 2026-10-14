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
import { arch, platform } from 'node:os';
import { attributionHeaders, EMPTY_RESPONSE_CODE, errorChain, LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { proxiedFetch } from '../http.js';
import { resolveImages } from '../translate/resolved.js';
import { streamResponses, toResponsesInput, toResponsesTools } from '../translate/responses.js';
import { deterministicSessionId, discoverAcrossAccounts, discoverOrRetryAuth, effortDisplayName, httpLlmError, idleWatchdog, isDiscoveryAborted, isMissingOrInvalidCredential, mapFetchFailure, mergeReasoning, ModelCatalogCache, OAuthEndpointError, oauthEndpointError, } from './common.js';
import { AccountTokenManager, DISCOVERY_TIMEOUT_MS, unionAccountCatalogs } from './accounts.js';
import { DEFAULT_RATE_LIMIT_WAIT, DEFAULT_RETRY, jsonBody, resetFromFields, subscriptionRetryPolicy, } from './rate-limit.js';
/** Public OAuth client id of the Muse Code CLI (from the official `muse` launcher). */
export const MUSE_CLIENT_ID = '1031625952748946';
export const MUSE_DEVICE_CODE_URL = 'https://auth.meta.com/oidc/device/authorization/';
export const MUSE_DEVICE_TOKEN_URL = 'https://auth.meta.com/oidc/device/token/';
/** Exchanges the OIDC identity token for the Model API key (and reports tier + usage). */
export const MUSE_KEY_URL = 'https://api.meta.ai/muse-code/key';
export const MUSE_API_URL = 'https://api.meta.ai/v1/responses';
export const MUSE_MODELS_URL = 'https://api.meta.ai/v1/models';
/** Muse CLI release this plugin presents itself as (user agent only). */
export const MUSE_CLI_VERSION = '1.4.7';
/**
 * Re-mint cadence. Meta does not disclose a key lifetime; integrations treat
 * the key as daily, and a re-mint of a still-valid key returns it unchanged,
 * so refreshing daily is free.
 */
export const MUSE_KEY_TTL_MS = 24 * 3_600_000;
/** Refresh when the key has less than this much of its assumed life left. */
export const MUSE_PREEMPT_MS = 5 * 60_000;
const MUSE_CONTEXT_WINDOW = 1_048_576;
/** The Muse CLI's own per-request output cap; Muse reasons heavily before any text. */
const MUSE_DEFAULT_MAX_TOKENS = 128_000;
/**
 * Efforts the Responses endpoint accepts (live-verified by muse-cc: `none`,
 * `max` and unknown values answer 400). `high` is the Muse CLI's default.
 */
const MUSE_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'];
const MUSE_DEFAULT_EFFORT = 'high';
/** Fields Meta uses to name a delay or reset in an error body. */
const MUSE_RESET_FIELDS = ['resets_at', 'retry_after'];
/** Reads the reset instant of a rejected Meta window from the error body. */
export const museRateLimitReset = (_response, body, now) => resetFromFields(jsonBody(body), MUSE_RESET_FIELDS, now);
/** User agent of a headless Muse CLI run on this machine. */
export function museUserAgent(os = platform(), cpu = arch()) {
    const osName = os === 'darwin' ? 'macos' : os === 'win32' ? 'windows' : os;
    const cpuName = cpu === 'arm64' ? 'aarch64' : cpu === 'x64' ? 'x86_64' : cpu;
    return `muse-build/${MUSE_CLI_VERSION} (non-interactive; ${osName}-${cpuName})`;
}
/** The launcher's own user agent, sent to auth.meta.com and the key mint. */
const MUSE_LAUNCHER_USER_AGENT = 'muse-code/launcher-3';
/**
 * The device-flow facts for the auth controller's DeviceFlowManager. Meta's
 * device endpoint takes the client id alone (no scope) and returns a
 * `verification_uri_complete` that already carries the user code.
 */
export function museDeviceFlow() {
    return {
        clientId: MUSE_CLIENT_ID,
        deviceCodeUrl: MUSE_DEVICE_CODE_URL,
        tokenUrl: MUSE_DEVICE_TOKEN_URL,
        headers: { 'user-agent': MUSE_LAUNCHER_USER_AGENT },
        brand: 'Meta',
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
export async function mintMuseKey(identityToken, fetchFn = proxiedFetch, signal) {
    const response = await fetchFn(MUSE_KEY_URL, {
        method: 'POST',
        headers: {
            'authorization': `Bearer ${identityToken}`,
            'accept': 'application/json',
            'content-type': 'application/json',
            'x-api-version': '1.0.0',
            'user-agent': MUSE_LAUNCHER_USER_AGENT,
        },
        body: '{}',
        ...signal === undefined ? {} : { signal },
    });
    if (!response.ok)
        throw await oauthEndpointError(response, 'muse key');
    const payload = await response.json();
    if (payload.require_payment === true) {
        // Not an OAuth failure: the login is fine, the account needs billing.
        throw new Error('Muse Code requires a payment method or subscription on this Meta account; finish setup at https://dev.meta.ai and log in again');
    }
    if (typeof payload.api_key !== 'string' || payload.api_key.length === 0) {
        throw new Error('Muse Code key endpoint returned no api_key; your Meta account may not be set up for the Model API yet (finish onboarding at https://dev.meta.ai)');
    }
    return payload;
}
/** Build a session from one mint response. */
function museSession(identityToken, minted, previous) {
    const account = nonEmpty(minted.user_email) ?? previous?.account;
    const plan = nonEmpty(minted.subs_tier_name) ?? previous?.plan;
    return {
        accessToken: minted.api_key,
        refreshToken: identityToken,
        expiresAt: Date.now() + MUSE_KEY_TTL_MS,
        ...account === undefined ? {} : { account },
        ...plan === undefined ? {} : { plan },
    };
}
function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
/**
 * Complete a device-flow login: mint the Model API key and read the account
 * identity from the same response.
 * @param identityToken - the Meta OIDC identity token the device flow released.
 * @param fetchFn - fetch implementation (injectable for tests).
 * @returns the session to store.
 */
export async function completeMuseLogin(identityToken, fetchFn = proxiedFetch) {
    const minted = await mintMuseKey(identityToken, fetchFn);
    if (minted.is_subs_active === false) {
        throw new Error('this Meta account has no active Muse Code subscription; subscribe at https://dev.meta.ai and log in again');
    }
    return museSession(identityToken, minted);
}
/**
 * Refresh a muse session: re-mint the Model API key from the identity token.
 * @param session - the stored session.
 * @param fetchFn - fetch implementation (injectable for tests).
 * @returns the fresh session to store.
 */
export async function refreshMuse(session, fetchFn = proxiedFetch) {
    return museSession(session.refreshToken, await mintMuseKey(session.refreshToken, fetchFn), session);
}
/**
 * Whether a muse refresh failure means the login is permanently gone.
 * @param error - the thrown refresh error.
 * @returns true when the identity token was rejected (re-login required).
 */
export function isMusePermanentRefreshError(error) {
    return error instanceof OAuthEndpointError && (error.status === 401 || error.status === 403);
}
/** Map one wire usage window; undefined when it carries no usable percentage. */
function museWindow(kind, wire) {
    if (wire === undefined || typeof wire.used_percent !== 'number' || !Number.isFinite(wire.used_percent))
        return undefined;
    const resetsAt = typeof wire.resets_at === 'number' && wire.resets_at > 0
        // Seconds, but tolerate a millisecond stamp should the wire ever switch.
        ? (wire.resets_at < 1e12 ? wire.resets_at * 1000 : wire.resets_at)
        : undefined;
    return { kind, usedPercent: wire.used_percent, ...resetsAt === undefined ? {} : { resetsAt } };
}
/**
 * Map a mint response's subscription usage to the usage RPC shape. The short
 * window is the 5-hour session window (`window_duration_mins: 300`); any other
 * duration is reported as `other` rather than mislabelled.
 */
export function museUsageFromKey(minted) {
    const windows = [];
    const short = minted.subs_usage?.window;
    const shortKind = short?.window_duration_mins === undefined || short.window_duration_mins === 300
        ? 'session'
        : 'other';
    const session = museWindow(shortKind, short);
    if (session !== undefined)
        windows.push(session);
    const weekly = museWindow('weekly', minted.subs_usage?.weekly);
    if (weekly !== undefined)
        windows.push(weekly);
    const plan = nonEmpty(minted.subs_tier_name);
    return { supported: true, windows, ...plan === undefined ? {} : { plan } };
}
/**
 * Fetch the subscription usage through the (idempotent) key mint.
 * @param session - the stored session (its identity token authorizes the mint).
 * @param fetchFn - fetch implementation (injectable for tests).
 * @param signal - caller cancellation from the RPC transport.
 * @returns the mapped usage snapshot.
 */
export async function fetchMuseUsage(session, fetchFn = proxiedFetch, signal) {
    const usage = museUsageFromKey(await mintMuseKey(session.refreshToken, fetchFn, signal));
    return usage.plan === undefined && session.plan !== undefined ? { ...usage, plan: session.plan } : usage;
}
/** Static reasoning block every Muse Spark model advertises. */
function museReasoning() {
    return {
        efforts: MUSE_EFFORTS.map(effort => ({ id: ReasoningEffortId(effort), name: effortDisplayName(effort) })),
        defaultEffort: ReasoningEffortId(MUSE_DEFAULT_EFFORT),
    };
}
/** Display name for a model id the catalog does not name (`muse-spark-1.3-contributor` → `Muse Spark 1.3 Contributor`). */
export function museModelName(id) {
    return id.split('-').map(part => /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}
/**
 * The model list also serves non-chat models (voice transcription, image
 * generation, embeddings) the picker must not offer.
 */
function isChatModel(id) {
    return !/voice|transcri|image|embed|tts|speech/i.test(id);
}
/**
 * Fetch the live model list. An empty list from a 200 response is a discovery
 * failure (the static catalog then serves), matching the Muse CLI, which ships
 * built-in models and treats the server catalog as an overlay.
 * @param session - the stored session (used as-is; never refreshed here).
 * @param fetchFn - fetch implementation (injectable for tests).
 * @param signal - caller cancellation.
 * @returns discovered chat models in endpoint order.
 */
export async function fetchMuseModels(session, fetchFn = proxiedFetch, signal) {
    const response = await fetchFn(MUSE_MODELS_URL, {
        headers: {
            'authorization': `Bearer ${session.accessToken}`,
            'accept': 'application/json',
            'x-client-id': 'tbh:exec',
            'user-agent': museUserAgent(),
        },
        ...signal === undefined ? {} : { signal },
    });
    if (!response.ok)
        throw await oauthEndpointError(response, 'muse models');
    const payload = await response.json();
    if (!Array.isArray(payload.data))
        throw new Error('muse models endpoint returned no data array');
    const seen = new Set();
    const discovered = [];
    for (const entry of payload.data) {
        if (typeof entry.id !== 'string' || entry.id.length === 0 || seen.has(entry.id) || !isChatModel(entry.id))
            continue;
        seen.add(entry.id);
        discovered.push({
            id: entry.id,
            name: nonEmpty(entry.name) ?? museModelName(entry.id),
            ...typeof entry.context_window === 'number' && entry.context_window > 0 ? { contextWindow: entry.context_window } : {},
            ...typeof entry.max_output_tokens === 'number' && entry.max_output_tokens > 0 ? { maxOutputTokens: entry.max_output_tokens } : {},
            reasoning: museReasoning(),
        });
    }
    if (discovered.length === 0)
        throw new Error('muse models endpoint returned an empty catalog');
    return discovered;
}
/** The replayable form of one completed reasoning item (needs its id and blob). */
function completedReasoningItem(item) {
    if (typeof item.encrypted_content !== 'string' || item.encrypted_content.length === 0)
        return undefined;
    if (typeof item.id !== 'string' || item.id.length === 0)
        return undefined;
    return {
        type: 'reasoning',
        id: item.id,
        summary: Array.isArray(item.summary) ? item.summary : [],
        ...typeof item.status === 'string' && item.status.length > 0 ? { status: item.status } : {},
        encrypted_content: item.encrypted_content,
    };
}
/**
 * Index the replayable reasoning of earlier assistant turns by call id. Only
 * turns this route produced for the same model and account qualify: encrypted
 * reasoning is bound to the model and credential that minted it. Every call
 * of one response maps to the SAME array, which `toResponsesInput` dedupes by
 * reference so parallel calls replay the items once.
 */
export function museReasoningIndex(messages, provider, model, account) {
    const index = new Map();
    for (const message of messages) {
        if (message.role !== 'assistant')
            continue;
        const source = message.source;
        if (source?.kind !== 'model' || source.provider !== provider || source.model !== model)
            continue;
        const replay = source.replayState;
        const response = replay?.response;
        if (response === null || typeof response !== 'object' || response.kind !== 'muse' || response.version !== 1)
            continue;
        if (response.account !== account)
            continue;
        if (!Array.isArray(response.calls) || !Array.isArray(response.reasoning) || response.reasoning.length === 0)
            continue;
        const items = response.reasoning.filter((item) => typeof item === 'object' && item !== null && item.type === 'reasoning'
            && typeof item.encrypted_content === 'string' && item.encrypted_content.length > 0);
        if (items.length === 0)
            continue;
        for (const call of response.calls)
            if (typeof call === 'string' && call.length > 0)
                index.set(call, items);
    }
    return index;
}
/**
 * Build one Muse Responses request body (exported for tests). Mirrors the Muse
 * CLI: Meta's `tool_choice` supports only `auto`, efforts ride
 * `reasoning.effort` with an `auto` summary, and the encrypted reasoning is
 * requested so tool round trips can replay it.
 */
export function museRequestBody(options, resolved) {
    return {
        model: options.model,
        ...resolved.instructions === undefined ? {} : { instructions: resolved.instructions },
        input: resolved.input,
        ...options.tools !== undefined && options.tools.length > 0
            ? { tools: toResponsesTools(options.tools, { strict: false }), tool_choice: 'auto', parallel_tool_calls: true }
            : {},
        ...options.maxTokens !== undefined ? { max_output_tokens: options.maxTokens } : {},
        ...options.reasoningEffort !== undefined
            ? { reasoning: { effort: String(options.reasoningEffort), summary: 'auto' } }
            : {},
        include: ['reasoning.encrypted_content'],
        ...options.sessionId !== undefined ? { prompt_cache_key: String(options.sessionId) } : {},
        store: false,
        stream: true,
    };
}
/** Request headers presenting a headless Muse CLI run. */
export function museHeaders(apiKey, sessionId) {
    const session = deterministicSessionId(sessionId);
    return {
        'authorization': `Bearer ${apiKey}`,
        'accept': 'text/event-stream',
        'content-type': 'application/json',
        'user-agent': museUserAgent(),
        'x-client-id': 'tbh:exec',
        'x-tbh-session-id': session,
        'x-meta-ai-gateway-session-id': session,
        'x-tbh-agent-role': 'main',
        ...attributionHeaders(),
    };
}
/** Muse wire adapter: one instance serves the `muse` provider route. */
export class MuseAdapter extends LlmAdapter {
    options;
    catalog;
    accountCatalogs = new Map();
    accountCatalogsInvalidated = false;
    invalidatedAccounts = new Set();
    catalogOwner;
    constructor(options) {
        super();
        this.options = options;
        this.catalog = new ModelCatalogCache(options.catalogStore, undefined, options.onCatalogChanged);
    }
    get fetchFn() {
        return this.options.fetchFn ?? proxiedFetch;
    }
    async fetchCatalog(account, signal) {
        return fetchMuseModels(await this.options.tokens.session(account), this.fetchFn, signal);
    }
    /** Drop cached catalogs after login/logout so the next list does not reuse a stale plan. */
    clearAccountCatalog(account) {
        if (account === undefined) {
            this.accountCatalogsInvalidated = true;
            this.invalidatedAccounts.clear();
        }
        else
            this.invalidatedAccounts.add(account);
        if (account === undefined) {
            for (const cache of this.accountCatalogs.values())
                cache.invalidate();
            this.accountCatalogs.clear();
        }
        else {
            this.accountCatalogs.get(account)?.invalidate();
            this.accountCatalogs.delete(account);
        }
        if (account === undefined || this.catalogOwner === account || this.catalogOwner === undefined) {
            this.catalogOwner = undefined;
            this.catalog.invalidate();
        }
    }
    async catalogFor(account) {
        const defaultKey = await this.options.tokens.defaultAccount();
        const key = account ?? defaultKey;
        if (key === undefined || key === defaultKey) {
            if (this.catalogOwner !== undefined && this.catalogOwner !== defaultKey)
                this.catalog.invalidate();
            this.catalogOwner = defaultKey;
            return this.catalog;
        }
        let cache = this.accountCatalogs.get(key);
        if (cache === undefined) {
            cache = new ModelCatalogCache(this.options.accountCatalogStore?.(key), undefined, this.options.onCatalogChanged);
            const invalidated = this.invalidatedAccounts.delete(key);
            if (this.accountCatalogsInvalidated || invalidated)
                cache.invalidate();
            this.accountCatalogs.set(key, cache);
        }
        return cache;
    }
    modalities(model) {
        return this.options.models.find(entry => entry.id === model)?.inputModalities ?? ['text', 'image'];
    }
    listed(provider, discovered) {
        return discovered.map(model => ({
            provider,
            id: model.id,
            name: model.name,
            inputModalities: this.modalities(model.id),
        }));
    }
    providerInfo(provider) {
        return { id: provider, name: 'Muse Code (Meta)' };
    }
    providerRetryPolicy(provider) {
        return subscriptionRetryPolicy(DEFAULT_RETRY, this.options.rateLimit ?? DEFAULT_RATE_LIMIT_WAIT, `muse: provider "${provider}" retryPolicy`);
    }
    staticModels(provider) {
        return this.options.models.map(model => ({
            provider,
            id: model.id,
            name: model.name ?? museModelName(model.id),
            inputModalities: model.inputModalities ?? ['text', 'image'],
        }));
    }
    async listModels(provider) {
        const own = await this.listOwnModels(provider, undefined, undefined, true);
        const pool = this.options.pool?.();
        if (pool === undefined)
            return own;
        const extra = await pool.modelsForProvider(provider);
        const seen = new Set(own.map(model => model.id));
        return [...own, ...extra.filter(model => !seen.has(model.id))];
    }
    /** The provider's own catalog: union of every account, or one account when named. */
    async listOwnModels(provider, account, signal, preferCached = false) {
        if (account === undefined) {
            const accounts = (await this.options.tokens.list()).map(entry => entry.key);
            if (accounts.length === 0)
                return [];
            return unionAccountCatalogs(accounts, (key, accountSignal) => this.listOwnModels(provider, key, accountSignal, preferCached), { timeoutMs: DISCOVERY_TIMEOUT_MS, ...signal === undefined ? {} : { signal } });
        }
        if (!await this.options.tokens.hasSession(account))
            return [];
        if (!this.options.discovery)
            return this.staticModels(provider);
        const catalog = await this.catalogFor(account);
        try {
            return this.listed(provider, await catalog.get(() => discoverOrRetryAuth(force => this.options.tokens.session(account, force), catalog, () => this.fetchCatalog(account, signal)), preferCached));
        }
        catch (error) {
            if (isDiscoveryAborted(error, signal))
                throw error;
            if (isMissingOrInvalidCredential(error))
                return [];
            // An empty server catalog is the normal state today (the Muse CLI's own
            // catalog cache is empty too), so it is not worth a warning.
            if (!(error instanceof Error && /empty catalog/.test(error.message))) {
                this.options.onWarn?.(`muse model discovery failed; using the built-in catalog (${errorChain(error)})`);
            }
            return this.staticModels(provider);
        }
    }
    async discovered(model) {
        if (!this.options.discovery)
            return undefined;
        const accounts = (await this.options.tokens.list()).map(entry => entry.key);
        return discoverAcrossAccounts(accounts, async (account) => {
            const catalog = await this.catalogFor(account);
            const models = await catalog.resolve(() => this.fetchCatalog(account));
            return models?.find(entry => entry.id === model);
        });
    }
    async resolveModel(provider, model) {
        const pool = this.options.pool?.();
        if (pool !== undefined && await pool.owns(provider, model)) {
            return pool.resolveModel(provider, model);
        }
        return this.resolveOwnModel(provider, model);
    }
    /** Capability resolution of the provider's own models (the pool resolves members here). */
    async resolveOwnModel(provider, model) {
        const discovered = await this.discovered(model);
        const configured = this.options.models.find(entry => entry.id === model);
        // Every Muse Spark model reasons with the same effort scale; the built-in
        // block is the fallback when the server catalog is silent.
        const reasoning = mergeReasoning(this.options.defaultEffortOf?.(model), discovered?.reasoning ?? museReasoning());
        return {
            provider,
            id: model,
            name: discovered?.name ?? configured?.name ?? museModelName(model),
            inputModalities: this.modalities(model),
            context: { contextWindow: discovered?.contextWindow ?? configured?.contextWindow ?? MUSE_CONTEXT_WINDOW },
            defaultMaxTokens: configured?.maxTokens ?? discovered?.maxOutputTokens ?? MUSE_DEFAULT_MAX_TOKENS,
            ...reasoning === undefined ? {} : { reasoning },
        };
    }
    async *stream(options) {
        const pool = this.options.pool?.();
        if (pool !== undefined && await pool.owns(options.provider, options.model)) {
            yield* pool.stream(options);
            return;
        }
        yield* this.streamCore(options);
    }
    /** Pool seam: stream through one specific account instead of the default. */
    streamAccount(options, account) {
        return this.streamCore(options, account);
    }
    async *streamCore(options, account) {
        const watchdog = idleWatchdog(options.signal, this.options.streamIdleTimeoutMs);
        try {
            const accountKey = account ?? await this.options.tokens.defaultAccount();
            let session = await this.options.tokens.session(account);
            const messages = await resolveImages(options.messages, this.options.resolveAttachments?.(), watchdog.signal);
            const replay = museReasoningIndex(options.messages, options.provider, options.model, accountKey);
            let replaying = replay.size > 0;
            const body = () => JSON.stringify(museRequestBody(options, toResponsesInput(messages, options.system, replaying ? callId => replay.get(callId) : undefined)));
            let response = await this.request(body(), session, options.sessionId, watchdog.signal);
            if (response.status === 401) {
                // One forced re-mint + retry on an unexpired-but-rejected key.
                session = await this.options.tokens.session(account, true);
                response = await this.request(body(), session, options.sessionId, watchdog.signal);
            }
            if (response.status === 400 && replaying) {
                // A gateway that rejects the replayed reasoning items must not break
                // the conversation: retry once without them (the model re-derives).
                await response.body?.cancel().catch(() => undefined);
                replaying = false;
                this.options.onWarn?.('muse rejected replayed reasoning items; retrying the request without them');
                response = await this.request(body(), session, options.sessionId, watchdog.signal);
            }
            if (!response.ok) {
                throw await httpLlmError(response, 'muse API', {
                    rateLimitReset: museRateLimitReset,
                    ...this.options.onWarn === undefined ? {} : { onWarn: this.options.onWarn },
                });
            }
            if (response.body === null) {
                throw new LlmError('muse API returned no response body', EMPTY_RESPONSE_CODE);
            }
            const calls = [];
            const reasoning = [];
            const capture = (event) => {
                const item = event.item;
                if (event.type === 'response.output_item.added' && item?.type === 'function_call'
                    && typeof item.call_id === 'string' && item.call_id.length > 0) {
                    calls.push(item.call_id);
                }
                else if (event.type === 'response.output_item.done' && item?.type === 'reasoning') {
                    const captured = completedReasoningItem(item);
                    if (captured !== undefined)
                        reasoning.push(captured);
                }
                return event;
            };
            for await (const chunk of streamResponses(response.body, () => { watchdog.pulse(); }, capture)) {
                if (chunk.type === 'finish' && chunk.reason.kind === 'tool-calls' && calls.length > 0 && reasoning.length > 0) {
                    const state = {
                        kind: 'muse', version: 1, ...accountKey === undefined ? {} : { account: accountKey }, calls, reasoning,
                    };
                    yield { ...chunk, replayState: { response: state } };
                }
                else {
                    yield chunk;
                }
            }
        }
        catch (error) {
            throw mapFetchFailure('muse API', error, watchdog, options.signal);
        }
        finally {
            watchdog.stop();
        }
    }
    request(body, session, sessionId, signal) {
        return this.fetchFn(MUSE_API_URL, {
            method: 'POST',
            headers: museHeaders(session.accessToken, sessionId === undefined ? undefined : String(sessionId)),
            body,
            signal,
        });
    }
}
