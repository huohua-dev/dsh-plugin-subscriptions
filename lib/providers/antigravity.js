/**
 * Google Antigravity subscription provider. This is intentionally separate
 * from Gemini CLI: it uses Antigravity OAuth scopes, project discovery, and
 * the daily-cloudcode-pa v1internal request envelope.
 */
import { errorChain, EMPTY_RESPONSE_CODE, LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { resolveImages } from '../translate/resolved.js';
import { parseAntigravityQuotaSummary } from './antigravity-usage.js';
import { ANTIGRAVITY_QUOTA_SCOPES, antigravityQuotaApplies } from '../antigravity-model-id.js';
import { groupAntigravityModels, selectAntigravityVariant, isAntigravityChatModel } from './antigravity-models.js';
import { antigravityReasoning } from '../translate/antigravity-thinking.js';
import { parseAntigravityResponse, streamAntigravity, toAntigravityRequest, } from '../translate/antigravity.js';
import { httpLlmError, idleWatchdog, mapFetchFailure, mergeReasoning, ModelCatalogCache, discoverOrRetryAuth, isMissingOrInvalidCredential, oauthEndpointError, OAuthEndpointError, discoverAcrossAccounts, isDiscoveryAborted, } from './common.js';
import { proxiedFetch } from '../http.js';
import { ANTIGRAVITY_DEFAULT_CLIENT_ID, ANTIGRAVITY_DEFAULT_CLIENT_SECRET } from './antigravity-oauth-client.js';
import { AccountTokenManager, DISCOVERY_TIMEOUT_MS, unionAccountCatalogs } from './accounts.js';
import { DEFAULT_RATE_LIMIT_WAIT, DEFAULT_RETRY, subscriptionRetryPolicy } from './rate-limit.js';
export const ANTIGRAVITY_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const ANTIGRAVITY_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const ANTIGRAVITY_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
export const ANTIGRAVITY_DEFAULT_BASE_URL = 'https://daily-cloudcode-pa.googleapis.com';
export const ANTIGRAVITY_PROD_BASE_URL = 'https://cloudcode-pa.googleapis.com';
/**
 * Client version the backend sees. The catalog and model routing are gated on
 * the desktop identity: with a 1.x agent the backend withholds the per-effort
 * Gemini 3.8 Flash ids (`gemini-3.8-flash-high/medium/low`, 404 on generate)
 * and offers only `gemini-3.8-flash-tiered`; Gemini 4 Argon
 * (`gemini-4-argon-low/medium/high`) is listed only for the `hub` client
 * family at 2.23.0 or later (`ide/2.23.0` and `hub/2.11.0` both omit it).
 */
export const ANTIGRAVITY_IDE_VERSION = '2.23.0';
/** Go-style OS/arch pair the desktop client appends (`darwin/arm64`, `windows/amd64`). */
function antigravityPlatform(platform, arch) {
    const os = platform === 'win32' ? 'windows' : platform;
    const cpu = arch === 'x64' ? 'amd64' : arch === 'ia32' ? '386' : arch;
    return `${os}/${cpu}`;
}
/** The Antigravity desktop user agent for one platform: `antigravity/hub/<version> <os>/<arch>`. */
export function antigravityUserAgent(platform = process.platform, arch = process.arch) {
    return `antigravity/hub/${ANTIGRAVITY_IDE_VERSION} ${antigravityPlatform(platform, arch)}`;
}
export const ANTIGRAVITY_DEFAULT_USER_AGENT = antigravityUserAgent();
export const ANTIGRAVITY_PREEMPT_MS = 5 * 60_000;
const ANTIGRAVITY_CALLBACK_PATH = '/oauth-callback';
// Fallback only when the catalog omits a window: Gemini's 1,048,576-token limit.
const ANTIGRAVITY_CONTEXT_WINDOW = 1_048_576;
// Fallback only when discovery is unavailable or the model omits its output cap.
const ANTIGRAVITY_DEFAULT_MAX_TOKENS = 32_768;
/** Antigravity, not Gemini CLI, OAuth scopes from the local reference clients. */
export const ANTIGRAVITY_SCOPES = [
    'openid',
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/cclog',
    'https://www.googleapis.com/auth/experimentsandconfigs',
];
/** Resolve a client pair: plugin config, environment, then the public desktop default. */
export function resolveAntigravityOAuthConfig(config) {
    const configuredId = config?.clientId?.trim();
    const configuredSecret = config?.clientSecret?.trim();
    const environmentId = process.env.ANTIGRAVITY_CLIENT_ID?.trim();
    const environmentSecret = process.env.ANTIGRAVITY_CLIENT_SECRET?.trim();
    if (configuredId) {
        // A custom PKCE-only client must never inherit a different client's secret.
        return { clientId: configuredId, ...configuredSecret ? { clientSecret: configuredSecret } : {} };
    }
    if (configuredSecret)
        throw new Error('config.antigravity.clientSecret requires config.antigravity.clientId');
    if (environmentId) {
        return { clientId: environmentId, ...environmentSecret ? { clientSecret: environmentSecret } : {} };
    }
    if (environmentSecret)
        throw new Error('ANTIGRAVITY_CLIENT_SECRET requires ANTIGRAVITY_CLIENT_ID');
    return { clientId: ANTIGRAVITY_DEFAULT_CLIENT_ID, clientSecret: ANTIGRAVITY_DEFAULT_CLIENT_SECRET };
}
/** Normalize the configured API origin and reject paths/credentials. */
export function antigravityBaseURL(value) {
    const parsed = new URL(value?.trim() || ANTIGRAVITY_DEFAULT_BASE_URL);
    if (parsed.protocol !== 'https:' || parsed.username.length > 0 || parsed.password.length > 0) {
        throw new Error('config.antigravity.baseURL must be an HTTPS origin without credentials');
    }
    if (parsed.pathname !== '/' || parsed.search.length > 0 || parsed.hash.length > 0) {
        throw new Error('config.antigravity.baseURL must not contain a path, query, or fragment');
    }
    return parsed.origin;
}
/** Try the production endpoint only when the default endpoint is unavailable. */
async function fetchAntigravity(method, init, runtime, fetchFn) {
    // Explicit origins stay pinned, and onboarding is not repeated across endpoints.
    const endpoints = runtime.baseURL?.trim() || method === 'onboardUser'
        ? [antigravityBaseURL(runtime.baseURL)]
        : [ANTIGRAVITY_DEFAULT_BASE_URL, ANTIGRAVITY_PROD_BASE_URL];
    for (const [index, endpoint] of endpoints.entries()) {
        init.signal?.throwIfAborted();
        let response;
        try {
            response = await fetchFn(`${endpoint}/v1internal:${method}`, init);
        }
        catch (error) {
            if (init.signal?.aborted || index === endpoints.length - 1)
                throw error;
            continue;
        }
        if (index === endpoints.length - 1 || ![404, 502, 503, 504].includes(response.status))
            return response;
        await response.body?.cancel();
    }
    throw new Error('Antigravity endpoint list is empty');
}
/** Google authorization-code + PKCE flow for Antigravity. */
export function antigravityFlow(oauth) {
    return {
        callbackPath: ANTIGRAVITY_CALLBACK_PATH,
        listen: { host: 'localhost', ports: [51121, 0] },
        timeoutMs: 5 * 60_000,
        buildAuthorizeUrl({ redirectUri, state, pkce }) {
            const params = new URLSearchParams({
                access_type: 'offline',
                client_id: oauth.clientId,
                code_challenge: pkce.challenge,
                code_challenge_method: 'S256',
                include_granted_scopes: 'true',
                prompt: 'consent',
                redirect_uri: redirectUri,
                response_type: 'code',
                scope: ANTIGRAVITY_SCOPES.join(' '),
                state,
            });
            return `${ANTIGRAVITY_AUTHORIZE_URL}?${params.toString()}`;
        },
    };
}
/** Shared Antigravity API headers. */
export function antigravityHeaders(accessToken, userAgent) {
    return {
        'authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
        // A blank configured value (the config form's empty field) means the default.
        'user-agent': userAgent?.trim() || ANTIGRAVITY_DEFAULT_USER_AGENT,
    };
}
/** POST a v1internal JSON method and classify non-2xx responses. */
async function callInternal(method, body, accessToken, runtime, fetchFn, signal) {
    const response = await fetchAntigravity(method, {
        method: 'POST',
        headers: antigravityHeaders(accessToken, runtime.userAgent),
        body: JSON.stringify(body),
        ...signal === undefined ? {} : { signal },
    }, runtime, fetchFn);
    if (!response.ok)
        throw await httpLlmError(response, `Antigravity ${method}`);
    return response.json();
}
function projectIdOf(value) {
    if (typeof value === 'string' && value.length > 0)
        return value;
    if (typeof value === 'object' && value !== null) {
        const id = value.id;
        if (typeof id === 'string' && id.length > 0)
            return id;
    }
    return undefined;
}
/** Read (and, when enabled, initialize) the Antigravity project/account. */
export async function discoverAntigravityAccount(accessToken, runtime = {}, fetchFn = proxiedFetch) {
    const metadata = { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' };
    const load = await callInternal('loadCodeAssist', { metadata }, accessToken, runtime, fetchFn);
    let projectId = projectIdOf(load.cloudaicompanionProject);
    if (projectId === undefined && runtime.onboard !== false) {
        const tierId = load.allowedTiers?.find(tier => tier.isDefault)?.id ?? 'LEGACY';
        const onboardBody = { tierId, metadata };
        for (let attempt = 0; attempt < 10; attempt++) {
            const result = await callInternal('onboardUser', onboardBody, accessToken, runtime, fetchFn);
            if (result.done === true) {
                projectId = projectIdOf(result.response?.cloudaicompanionProject);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 1_000));
        }
    }
    if (projectId === undefined) {
        throw new Error('Antigravity account has no Cloud AI Companion project; open Antigravity and complete onboarding, then log in again');
    }
    let account;
    try {
        const profileResponse = await fetchFn(ANTIGRAVITY_USERINFO_URL, {
            headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' },
        });
        if (profileResponse.ok) {
            const profile = await profileResponse.json();
            if (typeof profile.email === 'string' && profile.email.length > 0)
                account = profile.email;
        }
    }
    catch {
        // Identity is display-only; project discovery is the login boundary.
    }
    const plan = load.paidTier?.name ?? load.paidTier?.id ?? load.currentTier?.name ?? load.currentTier?.id;
    return {
        projectId,
        ...account === undefined ? {} : { account },
        ...typeof plan !== 'string' || plan.length === 0 ? {} : { plan },
    };
}
function sessionFromTokens(tokens, account, fallback) {
    if (typeof tokens.access_token !== 'string' || tokens.access_token.length === 0) {
        throw new Error('Antigravity token endpoint returned no access token');
    }
    const refreshToken = tokens.refresh_token ?? fallback?.refreshToken;
    if (refreshToken === undefined || refreshToken.length === 0) {
        throw new Error('Antigravity token endpoint returned no refresh token; revoke the app grant and log in again');
    }
    if (typeof tokens.expires_in !== 'number' || tokens.expires_in <= 0) {
        throw new Error('Antigravity token endpoint returned no usable expiry');
    }
    return {
        accessToken: tokens.access_token,
        refreshToken,
        expiresAt: Date.now() + tokens.expires_in * 1000,
        projectId: account.projectId,
        ...tokens.scope === undefined ? {} : { scopes: tokens.scope },
        ...account.account === undefined ? {} : { account: account.account },
        ...account.plan === undefined ? {} : { plan: account.plan },
    };
}
/** Exchange a Google OAuth authorization code and discover the Antigravity project. */
export async function exchangeAntigravityCode(code, verifier, redirectUri, oauth, runtime = {}, fetchFn = proxiedFetch) {
    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: oauth.clientId,
        code_verifier: verifier,
        ...oauth.clientSecret === undefined ? {} : { client_secret: oauth.clientSecret },
    });
    const response = await fetchFn(ANTIGRAVITY_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!response.ok)
        throw await oauthEndpointError(response, 'Antigravity');
    const tokens = await response.json();
    if (typeof tokens.access_token !== 'string')
        throw new Error('Antigravity token endpoint returned no access token');
    const account = await discoverAntigravityAccount(tokens.access_token, runtime, fetchFn);
    return sessionFromTokens(tokens, account);
}
/** Refresh a stored Antigravity Google token, preserving project/account metadata. */
export async function refreshAntigravity(session, oauth, fetchFn = proxiedFetch) {
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
        client_id: oauth.clientId,
        ...oauth.clientSecret === undefined ? {} : { client_secret: oauth.clientSecret },
    });
    const response = await fetchFn(ANTIGRAVITY_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
    });
    if (!response.ok)
        throw await oauthEndpointError(response, 'Antigravity');
    return sessionFromTokens(await response.json(), {
        projectId: session.projectId,
        ...session.account === undefined ? {} : { account: session.account },
        ...session.plan === undefined ? {} : { plan: session.plan },
    }, session);
}
/** Refresh failures that require a fresh Google consent grant. */
export function isAntigravityPermanentRefreshError(error) {
    return error instanceof OAuthEndpointError
        && (error.status === 400 || error.status === 401 || error.status === 403)
        && (error.oauthCode === 'invalid_grant' || error.status !== 400);
}
/** A positive safe-integer token count, or undefined. */
function tokenCount(value) {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
/** A catalog entry the account cannot use: flagged `disabled` or a `*-disabled` placeholder id. */
function isDisabledModel(id, model) {
    return model.disabled === true || id.toLowerCase().endsWith('-disabled');
}
/**
 * Whether a catalog entry can serve an agent turn. The catalog also lists the
 * editor's tab-completion and inline models (16K-32K windows, flagged
 * `isInternal` or named in `tabModelIds`, `tab_*` ids) and the image
 * generator; offering them in the picker only produces failing sessions.
 * Plan-gated launches also appear as `disabled: true` entries or `*-disabled`
 * placeholders (`gemini-4-argon-disabled` on an account Argon has not reached
 * yet); both fail every request.
 */
function isAgentModel(id, model, payload) {
    if (isDisabledModel(id, model))
        return false;
    if (model.isInternal === true || id.startsWith('tab_'))
        return false;
    if (payload.tabModelIds?.includes(id) === true)
        return false;
    return payload.imageGenerationModelIds?.includes(id) !== true;
}
/** Correct a stale Gemini version label only when the wire enum and the actual catalog ID agree. */
function catalogName(id, model) {
    const fallback = id.split('-').map(word => word.length === 0 ? word : word[0].toUpperCase() + word.slice(1)).join(' ');
    const label = model.displayName?.trim() || undefined;
    const concrete = typeof model.model === 'string' && /^MODEL_GOOGLE_GEMINI_(\d+(?:_\d+)*)_([A-Z]+(?:_[A-Z]+)*)$/.exec(model.model);
    if (!concrete)
        return label ?? fallback;
    const version = concrete[1].replace(/_/g, '.');
    const suffix = concrete[2].toLowerCase().split('_');
    if (id !== ['gemini', version, ...suffix].join('-'))
        return label ?? fallback;
    const inLabel = label && /\bGemini\s+(\d+(?:\.\d+)*)\b/i.exec(label);
    if (label && (!inLabel || inLabel[1] === version))
        return label;
    return ['Gemini', version, ...suffix.map(word => word[0].toUpperCase() + word.slice(1))].join(' ');
}
/** Fetch the authenticated account's live Antigravity model catalog. */
export async function fetchAntigravityModels(session, runtime = {}, fetchFn = proxiedFetch, signal) {
    const payload = await callInternal('fetchAvailableModels', { project: session.projectId }, session.accessToken, runtime, fetchFn, signal);
    if (typeof payload.models !== 'object' || payload.models === null) {
        throw new Error('Antigravity models endpoint returned no models object');
    }
    const nonChat = new Set([...payload.tabModelIds ?? [], ...payload.imageGenerationModelIds ?? []]);
    const ordered = (payload.agentModelSorts ?? []).flatMap(sort => (sort.groups ?? []).flatMap(group => group.modelIds ?? []));
    // tieredModelIds also contains category-only routes (e.g. pro, flashLite).
    // Only agentModelSorts describes the native selector's inventory.
    const selectable = ordered.length ? new Set(ordered) : undefined;
    const levels = ['LOW', 'MEDIUM', 'HIGH'];
    const models = Object.entries(payload.models).filter(([id, model]) => isAgentModel(id, model, payload)).map(([id, model]) => {
        const position = ordered.indexOf(id);
        return {
            id,
            antigravity: {
                visible: model.isInternal !== true && model.disabled !== true && model.selectable !== false
                    && !nonChat.has(id) && (selectable === undefined ? isAntigravityChatModel(id) : selectable.has(id)),
                ...Number.isInteger(model.thinkingLevel) && model.thinkingLevel >= 1 && model.thinkingLevel <= 3
                    ? { thinkingLevel: levels[model.thinkingLevel - 1] } : {},
                ...Number.isSafeInteger(model.thinkingBudget) && model.thinkingBudget >= -1 ? { thinkingBudget: model.thinkingBudget } : {},
            },
            ...ordered.length ? { priority: position < 0 ? ordered.length : position } : {},
            name: catalogName(id, model),
            ...model.description === undefined ? {} : { description: model.description },
            contextWindow: tokenCount(model.maxTokens) ?? tokenCount(model.inputTokenLimit)
                ?? tokenCount(model.maxInputTokens) ?? ANTIGRAVITY_CONTEXT_WINDOW,
            ...typeof model.maxOutputTokens === 'number' && Number.isSafeInteger(model.maxOutputTokens) && model.maxOutputTokens > 0
                ? { maxOutputTokens: model.maxOutputTokens } : {},
            inputModalities: model.supportsImages === true ? ['text', 'image'] : ['text'],
        };
    });
    if (models.length === 0)
        throw new Error('Antigravity models endpoint returned an empty catalog');
    return models.sort((a, b) => (a.priority ?? Number.MAX_SAFE_INTEGER) - (b.priority ?? Number.MAX_SAFE_INTEGER));
}
function resetTime(value) {
    if (typeof value !== 'string')
        return undefined;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function usageWindow(kind, scope, quota) {
    const remaining = quota?.remainingFraction;
    if (typeof remaining !== 'number' || !Number.isFinite(remaining))
        return undefined;
    const resetsAt = resetTime(quota?.resetTime);
    return {
        kind,
        scope,
        // Antigravity scopes a window by the exact model id it belongs to, so the
        // scope must match that id as a whole and never as a prefix of another.
        scopeExact: true,
        usedPercent: Math.max(0, Math.min(100, (1 - remaining) * 100)),
        ...resetsAt === undefined ? {} : { resetsAt },
    };
}
/** Fetch plan and per-model quota windows when the upstream exposes them. */
export async function fetchAntigravityUsage(session, runtime = {}, fetchFn = proxiedFetch, signal) {
    const metadata = { ideType: 'ANTIGRAVITY', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' };
    const readWindows = async () => {
        let shared = [];
        try {
            const summary = await callInternal('retrieveUserQuotaSummary', { project: session.projectId }, session.accessToken, runtime, fetchFn, signal);
            shared = parseAntigravityQuotaSummary(summary);
            if (ANTIGRAVITY_QUOTA_SCOPES.slice(0, 2).every(scope => shared.some(window => window.scope === scope)))
                return shared;
        }
        catch (error) {
            if (isDiscoveryAborted(error, signal))
                throw error;
            // Auth and throttling failures must surface rather than trigger extra requests.
            if (error instanceof LlmError && ['AUTH', 'RATE_LIMIT'].includes(error.code))
                throw error;
        }
        let models;
        try {
            models = await callInternal('fetchAvailableModels', { project: session.projectId }, session.accessToken, runtime, fetchFn, signal);
        }
        catch (error) {
            if (isDiscoveryAborted(error, signal) || shared.length === 0)
                throw error;
            // A missing supplemental lane must not discard valid shared quotas.
            return shared;
        }
        const roster = (models.agentModelSorts ?? []).flatMap(sort => (sort.groups ?? []).flatMap(group => group.modelIds ?? []));
        const selectable = roster.length ? new Set(roster) : undefined;
        const windows = [...shared];
        for (const [id, model] of Object.entries(models.models ?? {})) {
            if (!isAgentModel(id, model, models) || model.selectable === false
                || !(selectable ? selectable.has(id) : isAntigravityChatModel(id)))
                continue;
            // Missing groups (notably Argon) retain their explicitly reported model quota.
            if (shared.some(window => antigravityQuotaApplies(window.scope, id)))
                continue;
            const ordinary = usageWindow('other', id, model.quotaInfo);
            const weekly = usageWindow('weekly', id, model.weeklyQuotaInfo ?? model.weeklyQuota);
            if (ordinary !== undefined)
                windows.push(ordinary);
            if (weekly !== undefined)
                windows.push(weekly);
        }
        return windows;
    };
    const [windows, account] = await Promise.all([
        readWindows(),
        callInternal('loadCodeAssist', { metadata }, session.accessToken, runtime, fetchFn, signal),
    ]);
    const plan = account.paidTier?.name ?? account.paidTier?.id
        ?? account.currentTier?.name ?? account.currentTier?.id ?? session.plan;
    const credits = account.paidTier?.availableCredits?.[0]?.creditAmount;
    const displayPlan = credits === undefined ? plan : `${plan ?? 'Antigravity'} · ${String(credits)} credits`;
    return {
        supported: true,
        windows,
        ...displayPlan === undefined ? {} : { plan: displayPlan },
    };
}
/** URL for either v1internal generation transport. */
export function antigravityGenerateURL(baseURL, stream) {
    return `${antigravityBaseURL(baseURL)}/v1internal:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
}
/** Forward one already-built payload to generateContent or streamGenerateContent. */
export async function requestAntigravityContent(session, payload, stream, runtime = {}, fetchFn = proxiedFetch, signal) {
    return fetchAntigravity(stream ? 'streamGenerateContent?alt=sse' : 'generateContent', {
        method: 'POST',
        headers: {
            ...antigravityHeaders(session.accessToken, runtime.userAgent),
            accept: stream ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify(payload),
        ...signal === undefined ? {} : { signal },
    }, runtime, fetchFn);
}
/** DSH provider adapter for the `antigravity` route. */
export class AntigravityAdapter extends LlmAdapter {
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
    providerInfo(provider) {
        return { id: provider, name: 'Google Antigravity' };
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
    /** Default and secondary accounts each seed their own persisted catalog. */
    async catalogFor(account) {
        const defaultKey = await this.options.tokens.defaultAccount();
        const key = account ?? defaultKey;
        if (key === undefined || key === defaultKey) {
            if (this.catalogOwner !== undefined && this.catalogOwner !== defaultKey) {
                this.catalog.invalidate();
            }
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
    providerRetryPolicy(provider) {
        return subscriptionRetryPolicy(DEFAULT_RETRY, this.options.rateLimit ?? DEFAULT_RATE_LIMIT_WAIT, `antigravity: provider "${provider}" retryPolicy`);
    }
    staticModels(provider) {
        return this.options.models.map(model => ({
            provider,
            id: model.id,
            name: model.name ?? model.id,
            inputModalities: model.inputModalities ?? ['text', 'image'],
        }));
    }
    fetchCatalog(account, signal) {
        return this.options.tokens.session(account).then(session => fetchAntigravityModels(session, this.options.runtime, this.options.fetchFn, signal));
    }
    async listModels(provider) {
        const own = await this.listOwnModels(provider, undefined, undefined, true);
        const pool = this.options.pool?.();
        if (pool === undefined)
            return own;
        const extra = await pool.modelsForProvider(provider);
        const seen = new Set(own.map(model => model.id));
        // Account pools reuse the catalog row; only configured tiers are extra.
        return [...own, ...extra.filter(model => !seen.has(model.id))];
    }
    /** Picker rows for discovered entries (the wire id doubles as the route id). */
    listed(provider, models) {
        return models.map(model => ({
            provider,
            id: model.id,
            name: model.name,
            ...model.description === undefined ? {} : { description: model.description },
            inputModalities: model.inputModalities ?? ['text', 'image'],
        }));
    }
    /** The provider's own catalog: union of every account, or one account when named. */
    async listOwnModels(provider, account, signal, preferCached = false) {
        if (account === undefined) {
            const accounts = (await this.options.tokens.list()).map(entry => entry.key);
            if (accounts.length === 0)
                return [];
            return unionAccountCatalogs(accounts, (key, accountSignal) => this.listOwnModels(provider, key, accountSignal, preferCached), { timeoutMs: DISCOVERY_TIMEOUT_MS, ...signal === undefined ? {} : { signal } });
        }
        if (await this.options.tokens.peek(account) === undefined)
            return [];
        if (!this.options.discovery)
            return this.staticModels(provider);
        const catalog = await this.catalogFor(account);
        try {
            const models = await catalog.get(() => discoverOrRetryAuth(force => this.options.tokens.session(account, force), catalog, () => this.fetchCatalog(account, signal)), preferCached);
            return this.listed(provider, groupAntigravityModels(models));
        }
        catch (error) {
            if (isDiscoveryAborted(error, signal))
                throw error;
            if (isMissingOrInvalidCredential(error))
                return [];
            const known = await catalog.resolve(() => Promise.reject(error));
            if (known !== undefined)
                return groupAntigravityModels(known).map(model => ({ provider, id: model.id, name: model.name, inputModalities: model.inputModalities ?? ['text', 'image'] }));
            this.options.onWarn?.(`Antigravity model discovery failed; no verified catalog available (${errorChain(error)})`);
            return [];
        }
    }
    /**
     * One live model-list request for this account, bypassing every cache and
     * every fallback: the Settings probe must report what this account's own
     * proxy reached, and a cached or built-in catalog would say nothing.
     */
    async probeOwnModels(provider, account, signal) {
        if (!this.options.discovery)
            return this.staticModels(provider);
        return this.listed(provider, groupAntigravityModels(await this.fetchCatalog(account, signal)));
    }
    async discovered(model, account) {
        if (!this.options.discovery)
            return undefined;
        const accounts = account === undefined ? (await this.options.tokens.list()).map(entry => entry.key) : [account];
        return discoverAcrossAccounts(accounts, async (key) => {
            const catalog = await this.catalogFor(key);
            const models = await catalog.resolve(() => this.fetchCatalog(key));
            return (models === undefined ? undefined : groupAntigravityModels(models).find(entry => entry.id === model))
                ?? models?.find(entry => entry.id === model);
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
    async resolveOwnModel(provider, model, account) {
        const discovered = await this.discovered(model, account);
        const configured = this.options.models.find(entry => entry.id === model);
        const fixedLevel = discovered?.antigravity?.thinkingLevel?.toLowerCase();
        const fixedReasoning = fixedLevel === undefined ? antigravityReasoning(model)
            : { efforts: [{ id: ReasoningEffortId(fixedLevel), name: fixedLevel[0].toUpperCase() + fixedLevel.slice(1) }] };
        const reasoning = mergeReasoning(this.options.defaultEffortOf?.(model), discovered?.reasoning ?? fixedReasoning);
        const outputLimit = discovered?.maxOutputTokens;
        const preferredMaxTokens = configured?.maxTokens ?? outputLimit ?? ANTIGRAVITY_DEFAULT_MAX_TOKENS;
        // Configuration may lower the default, but must not exceed a known server cap.
        const defaultMaxTokens = outputLimit === undefined ? preferredMaxTokens : Math.min(preferredMaxTokens, outputLimit);
        return {
            provider,
            id: model,
            name: discovered?.name ?? configured?.name ?? model,
            ...discovered?.description === undefined ? {} : { description: discovered.description },
            inputModalities: discovered?.inputModalities ?? configured?.inputModalities ?? ['text', 'image'],
            context: { contextWindow: discovered?.contextWindow ?? configured?.contextWindow ?? ANTIGRAVITY_CONTEXT_WINDOW },
            defaultMaxTokens,
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
    /** Resolve a presentation id against the serving account, keeping legacy concrete ids usable. */
    async selectedOptions(options, account) {
        if (!this.options.discovery)
            return { options, wireModel: options.model };
        const catalog = await this.catalogFor(account);
        const models = await catalog.resolve(() => this.fetchCatalog(account, options.signal));
        options.signal?.throwIfAborted();
        if (models === undefined)
            throw new LlmError('Antigravity model catalog is unavailable; refresh the subscription model list', 'NO_ADAPTER');
        const group = groupAntigravityModels(models).find(entry => entry.id === options.model);
        if (group?.variants === undefined) {
            // A synthetic group must not be sent to an account where only other models exist.
            if (!models.some(entry => entry.id === options.model)) {
                throw new LlmError(`Antigravity model ${options.model} is not available for this account`, 'NO_ADAPTER');
            }
            const concrete = models?.find(entry => entry.id === options.model);
            const fixed = antigravityReasoning(options.model)?.efforts;
            const profile = concrete?.antigravity;
            if (concrete !== undefined && (profile?.thinkingLevel !== undefined || fixed?.length === 1 && /-(low|medium|high)$/.test(options.model))) {
                const effort = profile?.thinkingLevel?.toLowerCase() ?? fixed[0].id;
                if (options.reasoningEffort !== undefined && options.reasoningEffort !== effort) {
                    throw new LlmError(`Antigravity model ${options.model} does not support reasoning effort ${options.reasoningEffort}`, 'UNSUPPORTED_REASONING_EFFORT');
                }
                const { reasoningEffort: _effort, ...generation } = options;
                return { options: generation, wireModel: options.model, ...profile === undefined ? {} : { profile } };
            }
            return { options, wireModel: options.model, ...profile === undefined ? {} : { profile } };
        }
        const configured = this.options.defaultEffortOf?.(options.model);
        const validDefault = group.reasoning?.efforts.some(entry => entry.id === configured) ? configured : group.reasoning?.defaultEffort;
        const effort = options.reasoningEffort ?? validDefault;
        const variant = selectAntigravityVariant(group, effort);
        const { reasoningEffort: _effort, ...generation } = options;
        return {
            // The variant encodes effort; do not also impose the unrelated legacy thinking budget.
            options: generation,
            wireModel: variant.id,
            ...variant.antigravity === undefined ? {} : { profile: variant.antigravity },
        };
    }
    async *streamCore(options, account) {
        const watchdog = idleWatchdog(options.signal, this.options.streamIdleTimeoutMs);
        try {
            let session = await this.options.tokens.session(account);
            const messages = await resolveImages(options.messages, this.options.resolveAttachments?.(), watchdog.signal);
            let selected = await this.selectedOptions({ ...options, signal: watchdog.signal }, account);
            let payload = toAntigravityRequest(selected.options, messages, session.projectId, true, selected.wireModel, selected.profile);
            let response = await requestAntigravityContent(session, payload, true, this.options.runtime, this.options.fetchFn, watchdog.signal);
            if (response.status === 401) {
                this.clearAccountCatalog(account);
                session = await this.options.tokens.session(account, true);
                selected = await this.selectedOptions({ ...options, signal: watchdog.signal }, account);
                payload = toAntigravityRequest(selected.options, messages, session.projectId, true, selected.wireModel, selected.profile);
                response = await requestAntigravityContent(session, payload, true, this.options.runtime, this.options.fetchFn, watchdog.signal);
            }
            if (!response.ok)
                throw await httpLlmError(response, 'Antigravity API');
            if (response.body === null) {
                throw new LlmError('Antigravity API returned no response body', EMPTY_RESPONSE_CODE);
            }
            for await (const chunk of streamAntigravity(response.body, () => { watchdog.pulse(); }, this.options.resolveAttachments?.(), watchdog.signal)) {
                yield withWireModel(chunk, selected.wireModel);
            }
        }
        catch (error) {
            throw mapFetchFailure('Antigravity API', error, watchdog, options.signal);
        }
        finally {
            watchdog.stop();
        }
    }
    /** Non-stream forwarding seam used by tests and future DSH complete calls. */
    async generate(options) {
        const session = await this.options.tokens.session();
        const messages = await resolveImages(options.messages, this.options.resolveAttachments?.(), options.signal);
        const selected = await this.selectedOptions(options);
        const response = await requestAntigravityContent(session, toAntigravityRequest(selected.options, messages, session.projectId, false, selected.wireModel, selected.profile), false, this.options.runtime, this.options.fetchFn, options.signal);
        if (!response.ok)
            throw await httpLlmError(response, 'Antigravity API');
        return (await parseAntigravityResponse(await response.json(), this.options.resolveAttachments?.(), options.signal))
            .map(chunk => withWireModel(chunk, selected.wireModel));
    }
}
/** Bind replay signatures to the effective variant, not just its presentation group. */
function withWireModel(chunk, wireModel) {
    if (chunk.type !== 'finish' || chunk.replayState === undefined)
        return chunk;
    const state = chunk.replayState;
    return { ...chunk, replayState: { ...state, response: { ...state.response, wireModel } } };
}
