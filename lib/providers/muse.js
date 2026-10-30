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
import { EMPTY_RESPONSE_CODE, errorChain, LlmAdapter, LlmError, ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import { proxiedFetch } from '../http.js';
import { MUSE_ATTESTATION_NOTICE, MUSE_BUILTIN_TOOL_NAMESPACE } from './muse-builtin-tools.js';
import { hostSupportsImageOffload, IMAGE_OFFLOAD_REQUIRED, requiredImageOffloadCount, resolveImages } from '../translate/resolved.js';
import { boundResponsesCallIds, streamResponses, toResponsesInput, toResponsesTools } from '../translate/responses.js';
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
/** The Muse CLI's catalog: per-model limits, modalities, efforts, visibility. */
export const MUSE_MODELS_URL = 'https://api.meta.ai/muse-code/models';
/**
 * Muse CLI release this plugin presents itself as (user agent only). The
 * builtin tool declarations in {@link MUSE_BUILTIN_TOOL_NAMESPACE} are the
 * ones that release sends; move both together.
 */
export const MUSE_CLI_VERSION = '1.4.14';
/**
 * Re-mint cadence. Meta does not disclose a key lifetime; integrations treat
 * the key as daily, and a re-mint of a still-valid key returns it unchanged,
 * so refreshing daily is free.
 */
export const MUSE_KEY_TTL_MS = 24 * 3_600_000;
/** Refresh when the key has less than this much of its assumed life left. */
export const MUSE_PREEMPT_MS = 5 * 60_000;
/** Context limit the live catalog reports for every Muse chat model. */
const MUSE_CONTEXT_WINDOW = 1_007_997;
/** The Muse CLI's own per-request output cap; Muse reasons heavily before any text. */
const MUSE_DEFAULT_MAX_TOKENS = 128_000;
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
export const MUSE_IMAGE_LIMIT = { maxEdge: 2000, maxBytes: 1_000_000 };
/**
 * Inline image data a Muse request may carry, in base64 bytes. Past it the
 * host offloads the oldest images to text and retries, so a long image-heavy
 * session cannot grow the upload without bound.
 */
export const MUSE_REQUEST_IMAGE_BUDGET = 10 * 1024 * 1024;
/**
 * Efforts the Responses endpoint accepts, in display order (live-verified:
 * `none` answers 400 "Supported values: [minimal, low, medium, high, xhigh,
 * max]"). `high` is the catalog's and the Muse CLI's default.
 */
const MUSE_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
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
/** Static reasoning block every Muse chat model advertises. */
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
 * Meta gates the model catalog on the caller's network: from some egress IPs
 * (commercial proxy exits among them) it answers an empty list on every call,
 * while the same key lists every model from another network. Inference from
 * such a network is refused for some models some of the time (see
 * {@link MUSE_BLOCKED_NETWORK_HINT}); the built-in catalog serves the picker.
 */
export const MUSE_NETWORK_HINT = 'Meta returns an empty model catalog to some networks (the same account lists '
    + 'its models from another egress); the built-in Muse catalog is used instead';
/**
 * Why an entitled model answers 404 `model_not_found` (live-verified with one
 * key across two egresses): a network Meta blocks (its catalog is empty there)
 * gets the 404, and every such rejection makes Meta refuse that model for the
 * whole account on every network — the Muse CLI on a clean VPS included — for
 * a few minutes, intermittently (about 3 minutes after a dozen rejections).
 * Catalog reads and served requests from the blocked network do not poison.
 */
export const MUSE_MODEL_NOT_FOUND_HINT = 'Meta refuses this model for the account for a few minutes after requests from '
    + 'a network it blocks (from any device or client using this account); it was retried automatically and recovers '
    + 'once only unblocked networks are used';
/** Error code of a request refused because this network is blocked (not retried, does not park a pool member). */
export const MUSE_NETWORK_BLOCKED_CODE = 'MUSE_NETWORK_BLOCKED';
/** Explanation attached to {@link MUSE_NETWORK_BLOCKED_CODE} failures. */
export const MUSE_BLOCKED_NETWORK_HINT = 'Meta is blocking Muse on this network: its model catalog is empty here and '
    + 'the model was refused. Each refused request also makes Meta refuse the model for this account on other networks '
    + 'and devices (the Muse CLI included) for a few minutes, so it is not retried. Route api.meta.ai through another '
    + 'network (another proxy exit, a VPS, or the plugin proxy setting)';
/** A 404 body naming a missing model (Responses and Messages wire spellings). */
const MUSE_MODEL_NOT_FOUND = /model_not_found|model not found or access denied/i;
/** Waits between retries of a `model_not_found` on an unblocked network (three retries, ~7 s). */
export const MUSE_MODEL_NOT_FOUND_BACKOFF_MS = [1000, 2000, 4000];
/**
 * After a blocked network was seen, requests within this window re-check the
 * catalog before sending, so manual retries from the same network fail fast
 * instead of poisoning the account again.
 */
const MUSE_BLOCKED_RECHECK_MS = 5 * 60_000;
/**
 * Whether Meta answers this network an empty catalog (the blocked-network
 * signal). Reading the catalog does not poison the account.
 * @returns true for an empty list, false for a populated one, undefined when
 *   the probe itself failed (unknown).
 */
export async function museCatalogEmpty(session, fetchFn = proxiedFetch, signal) {
    try {
        const response = await fetchFn(MUSE_MODELS_URL, {
            headers: {
                'authorization': `Bearer ${session.accessToken}`,
                'accept': 'application/json',
                'x-client-id': 'tbh:exec',
                'user-agent': museUserAgent(),
            },
            ...signal === undefined ? {} : { signal },
        });
        if (!response.ok) {
            await response.body?.cancel().catch(() => undefined);
            return undefined;
        }
        const payload = await response.json();
        return Array.isArray(payload.data) ? payload.data.length === 0 : undefined;
    }
    catch {
        return undefined;
    }
}
/** Sleep for `ms`, rejecting early when the signal aborts. */
function sleep(ms, signal) {
    return new Promise((resolve, reject) => {
        if (signal.aborted) {
            reject(signal.reason);
            return;
        }
        const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve(); }, ms);
        signal.addEventListener('abort', onAbort, { once: true });
    });
}
/** Efforts one catalog entry advertises, in canonical order; undefined when it lists none. */
function catalogReasoning(meta) {
    const variants = Object.values(meta.variants ?? {})
        .map(variant => variant?.reasoningEffort)
        .filter((effort) => typeof effort === 'string' && effort.length > 0);
    if (variants.length === 0)
        return undefined;
    const known = MUSE_EFFORTS.filter(effort => variants.includes(effort));
    const extra = variants.filter(effort => !MUSE_EFFORTS.includes(effort));
    const efforts = [...known, ...extra].map(effort => ({ id: ReasoningEffortId(effort), name: effortDisplayName(effort) }));
    const preferred = meta.options?.reasoningEffort;
    const fallback = efforts.some(effort => effort.id === MUSE_DEFAULT_EFFORT) ? MUSE_DEFAULT_EFFORT : undefined;
    const defaultEffort = typeof preferred === 'string' && efforts.some(effort => effort.id === preferred) ? preferred : fallback;
    return { efforts, ...defaultEffort === undefined ? {} : { defaultEffort: ReasoningEffortId(defaultEffort) } };
}
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
        if (typeof entry.id !== 'string' || entry.id.length === 0 || seen.has(entry.id))
            continue;
        const meta = entry.metadata?.['muse-code'] ?? {};
        if (meta.is_hidden === true || meta.tool_call === false)
            continue;
        if (Array.isArray(meta.modalities?.output) && !meta.modalities.output.includes('text'))
            continue;
        seen.add(entry.id);
        const input = (meta.modalities?.input ?? []).filter((modality) => modality === 'text' || modality === 'image');
        const name = nonEmpty(meta.name);
        discovered.push({
            id: entry.id,
            // The catalog's name is usually the bare id; prettify those.
            name: name === undefined || name === entry.id ? museModelName(entry.id) : name,
            ...typeof meta.limit?.context === 'number' && meta.limit.context > 0 ? { contextWindow: meta.limit.context } : {},
            ...typeof meta.limit?.output === 'number' && meta.limit.output > 0 ? { maxOutputTokens: meta.limit.output } : {},
            ...input.includes('text') ? { inputModalities: input } : {},
            reasoning: catalogReasoning(meta) ?? museReasoning(),
        });
    }
    if (discovered.length === 0)
        throw new Error(`muse models endpoint returned an empty catalog. ${MUSE_NETWORK_HINT}`);
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
export const MUSE_DANGLING_STOP_NOTICE = '[automatic notice] Your previous reply ended without a tool call, so the turn '
    + 'stopped. Did that reply announce an action (a command, a tool call, a file read, a check) that you have not '
    + 'performed yet? If yes, perform it now with the tool call and no other text. If no, because the task is complete '
    + "or you need the user's input, reply with only the word NONE.";
/**
 * Longest text-only reply the dangling-stop check looks at. In the recorded
 * Muse sessions every premature stop was 110 characters or fewer and every
 * real final answer after tool work was 428 or more.
 */
export const MUSE_DANGLING_STOP_MAX_CHARS = 300;
/**
 * Waits between attempts at the early-stop continuation, one entry per extra
 * attempt; only transient failures (a transport cut, a 5xx) reach them. The same
 * flaky route that makes the first request of a step retry must not swallow the
 * continuation silently: recorded 2026-10-17, a continuation request died
 * 10.7 s after a step whose own request had needed two retries, and the user had
 * to type "continue". On 2026-10-18 the retries themselves all died — a step that
 * survived four harness retries ended early, and three continuation attempts
 * spent 35 s in the same bad window — so the budget follows the host's shape
 * rather than stopping at three. Overridable for tests.
 */
const MUSE_CONTINUATION_RETRY_MS = [500, 1_500, 4_000, 10_000];
/**
 * A last sentence that hands control to the user on purpose: a question or an
 * offer. `你看` counts only when it asks the user to look ("你看呢/你看看");
 * inside a description ("你看到的报错来自那一层") it is not a hand-back. A
 * recorded premature stop ended with exactly that phrase and the guard missed
 * it, so the turn stopped and the user had to type "continue".
 */
const MUSE_ADDRESSED_TO_USER = new RegExp([
    '如果你|如果需要|如果想|要不要|需要我|要我|你可以|你想|你看(?!到|见|得|过)|你说一声|告诉我|让我知道|请你|请确认|是否需要|是否要|需不需要',
    "if you|would you|do you want|want me to|let me know|shall i|should i|feel free",
].join('|'), 'i');
/** A last sentence that says the next action is still to come. */
const MUSE_ANNOUNCES_NEXT_STEP = new RegExp([
    '现在|正在|接着|接下来|然后|随后|下面|下一步|马上|立刻|立即|这就|我就|我来|我去|我先|我再|待会|稍后|之后再|继续|开始|最后(?:再)?(?:核对|检查|确认|验证|看)',
    '(?:先|再|去|来|要|得|准备|打算)[^，。；;\\n]{0,8}(?:看|查|读|跑|试|写|改|拼|搜|找|装|提取|对比|比较|确认|核对|检查|验证|运行|执行|调用|提交|生成|出图|对照|打开|拉取|拆)',
    "\\b(?:let me|let's|i'll|i will|i'm going to|i am going to|i'm about to|going to|about to|now i|next,? i|then i|first,? i|will now|proceeding|continuing|moving on)\\b",
].join('|'), 'i');
/** A last sentence that reports the work as done, or the answer as found. */
const MUSE_REPORTS_DONE = new RegExp([
    '已完成|完成了|搞定|已修复|已经修复|修好了|已推送|已提交|已更新|已创建|已删除|已安装|已部署|已合并|全部通过|测试通过|通过了|成功',
    '没有(?:问题|错误|发现|找到|匹配|变化|改动)|无需|不需要|一切正常|结果如下|结论(?:如下|是|[:：])',
    '\\b(?:done|finished|completed|fixed|all set|pushed|committed|deployed|merged|pass(?:es|ed)?|succeeded|no (?:issues|errors|problems|changes)|nothing (?:to|more|left))\\b',
].join('|'), 'i');
/**
 * Shape a reply must have to be considered an early stop at all: short,
 * unstructured, and, in its last sentence, neither a question nor an offer to
 * the user. Shared by {@link museDanglingText} and {@link museAnnouncesAction}.
 *
 * The hand-back test looks at the last sentence only. A recorded premature stop
 * read "…你看到的不兼容报错来自那一层。我把那段判定逻辑完整抠出来看。" — the
 * mention of "你看到" is a description, not a question — and a whole-reply test
 * threw the stop away, so the user had to type "continue". Only the sentence
 * that would carry the question can hand control back.
 * @param text - the reply's text blocks, joined.
 * @returns the trimmed reply and its last sentence, or undefined when the reply
 *   cannot be an early stop.
 */
function museEarlyStopReply(text) {
    const reply = text.trim();
    if (reply.length === 0 || reply.length > MUSE_DANGLING_STOP_MAX_CHARS)
        return undefined;
    if (reply.includes('```'))
        return undefined;
    const structured = reply.split('\n').filter(line => /^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|\|)/.test(line));
    if (structured.length >= 2)
        return undefined;
    if (/[?？]\s*$/.test(reply))
        return undefined;
    const sentences = reply.split(/[。！!？?\n]+/).map(sentence => sentence.trim()).filter(sentence => sentence.length > 0);
    const last = sentences.at(-1) ?? reply;
    if (MUSE_ADDRESSED_TO_USER.test(last))
        return undefined;
    return { reply, last };
}
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
export function museDanglingText(text) {
    const shaped = museEarlyStopReply(text);
    if (shaped === undefined)
        return false;
    if (/[:：]\s*$/.test(shaped.reply))
        return true;
    if (MUSE_ANNOUNCES_NEXT_STEP.test(shaped.last))
        return true;
    return !MUSE_REPORTS_DONE.test(shaped.last);
}
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
export function museAnnouncesAction(text) {
    const shaped = museEarlyStopReply(text);
    if (shaped === undefined)
        return false;
    return /[:：]\s*$/.test(shaped.reply) || MUSE_ANNOUNCES_NEXT_STEP.test(shaped.last);
}
/**
 * Whether the model is in the middle of a tool loop: the newest real input is
 * a tool result, not something the user typed. DSH slips its own context
 * messages (time, instructions, catalogs) between the two as user-role
 * messages with another `source.kind`; those are skipped. A reply to a fresh
 * user message is checked by {@link museAnnouncesAction} instead: it counts only
 * when the reply itself announces an action.
 * @param messages - the request's messages.
 */
export function museMidToolLoop(messages) {
    for (let index = messages.length - 1; index >= 0; index--) {
        const message = messages[index];
        if (message.role === 'tool')
            return true;
        if (message.role === 'assistant')
            return false;
        if (message.role === 'user') {
            const kind = message.source?.kind;
            if (kind === undefined || kind === 'user')
                return false;
        }
    }
    return false;
}
/**
 * Usage of a step that took two requests. The kept response's request is the
 * context the next step starts from, so its input and cache counts stand; the
 * other response only adds the tokens it generated.
 */
export function museMergedUsage(kept, other) {
    if (kept === undefined || other === undefined)
        return kept ?? other;
    const reasoning = (kept.reasoningTokens ?? 0) + (other.reasoningTokens ?? 0);
    return {
        ...kept,
        outputTokens: kept.outputTokens + other.outputTokens,
        ...kept.reasoningTokens !== undefined || other.reasoningTokens !== undefined ? { reasoningTokens: reasoning } : {},
    };
}
function newOutcome() {
    return { calls: [], reasoning: [], text: [], blocks: 0, toolCalls: false };
}
/** Fold one translated chunk into the outcome it belongs to. */
function recordChunk(outcome, chunk) {
    switch (chunk.type) {
        case 'block-start':
            outcome.blocks = Math.max(outcome.blocks, chunk.index + 1);
            if (chunk.blockType === 'tool-call')
                outcome.toolCalls = true;
            break;
        case 'block-end':
            if (chunk.block.type === 'text')
                outcome.text.push(chunk.block.text);
            break;
        case 'usage':
            outcome.usage = chunk.usage;
            break;
        case 'finish':
            outcome.finish = chunk;
            break;
    }
}
/** The event tap that captures call ids and completed reasoning items into `outcome`. */
function captureInto(outcome) {
    return event => {
        const item = event.item;
        if (event.type === 'response.output_item.added' && item?.type === 'function_call'
            && typeof item.call_id === 'string' && item.call_id.length > 0) {
            outcome.calls.push(item.call_id);
        }
        else if (event.type === 'response.output_item.done' && item?.type === 'reasoning') {
            const captured = completedReasoningItem(item);
            if (captured !== undefined)
                outcome.reasoning.push(captured);
        }
        return event;
    };
}
/** Prefix every Muse Code builtin tool name carries inside its `muse` namespace. */
export const MUSE_BUILTIN_TOOL_PREFIX = 'muse.';
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
export function museToolCallName(name, declared) {
    if (!name.startsWith(MUSE_BUILTIN_TOOL_PREFIX))
        return name;
    const bare = name.slice(MUSE_BUILTIN_TOOL_PREFIX.length);
    return declared.has(bare) ? bare : name;
}
/** Event tap: rewrite a namespaced builtin call, then run the caller's capture. */
function museEventTap(capture, declared) {
    return event => {
        const item = event.item;
        if (item?.type === 'function_call' && typeof item.name === 'string') {
            const name = museToolCallName(item.name, declared);
            if (name !== item.name)
                event = { ...event, item: { ...item, name } };
        }
        return capture(event);
    };
}
/** The chunk moved to a later block index (a second response continuing one message). */
function shiftedChunk(chunk, offset) {
    return offset === 0 || !('index' in chunk) ? chunk : { ...chunk, index: chunk.index + offset };
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
    const carriesTools = options.tools !== undefined && options.tools.length > 0;
    // Meta's gateway refuses a subscription-billed key (`403
    // client_attestation_denied`) when a request declares more than a handful of
    // tools without Muse Code's builtin declarations alongside them, so a
    // tool-carrying request declares the CLI's `muse` namespace verbatim, ahead
    // of this client's own tools. Requests without tools are left untouched.
    const tools = carriesTools
        ? [MUSE_BUILTIN_TOOL_NAMESPACE, ...toResponsesTools(options.tools ?? [], { strict: false })]
        : undefined;
    const instructions = resolved.instructions === undefined
        ? carriesTools ? MUSE_ATTESTATION_NOTICE : undefined
        : carriesTools ? `${resolved.instructions}\n\n${MUSE_ATTESTATION_NOTICE}` : resolved.instructions;
    return {
        model: options.model,
        ...instructions === undefined ? {} : { instructions },
        // [2026-10-30]-[a session that switched to Muse from another route keeps
        // that route's tool call ids; OpenAI-compatible routers mint composite
        // `call_…|fc_…` ids up to 83 chars and Meta's gateway refuses the whole
        // request ("`input[n].call_id` … must be `<= 64`"), wedging the session]
        input: boundResponsesCallIds(resolved.input),
        ...tools === undefined ? {} : { tools, tool_choice: 'auto', parallel_tool_calls: true },
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
/**
 * Request headers presenting a headless Muse CLI run. No DSH attribution:
 * its only header is a `user-agent`, which would replace the Muse CLI's.
 */
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
    warnedEmptyCatalog = false;
    /** Account + model → when a request was last refused on a blocked network. */
    blockedAt = new Map();
    constructor(options) {
        super();
        this.options = options;
        this.catalog = new ModelCatalogCache(options.catalogStore, undefined, options.onCatalogChanged);
    }
    get fetchFn() {
        return this.options.fetchFn ?? proxiedFetch;
    }
    now() {
        return (this.options.now ?? Date.now)();
    }
    /**
     * The non-retryable failure of a request on a blocked network: refused by
     * Meta (`sent`, an HTTP 404) or held back by the pre-send check.
     */
    blockedNetwork(blockKey, sent) {
        this.blockedAt.set(blockKey, this.now());
        const lead = sent
            ? 'muse API error (HTTP 404): model_not_found'
            : 'muse request not sent: the model catalog is still empty on this network';
        return new LlmError(`${lead}. ${MUSE_BLOCKED_NETWORK_HINT}`, MUSE_NETWORK_BLOCKED_CODE, sent ? { status: 404 } : {});
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
    modalities(model, discovered) {
        return this.options.models.find(entry => entry.id === model)?.inputModalities
            ?? discovered?.inputModalities
            ?? ['text', 'image'];
    }
    listed(provider, discovered) {
        return discovered.map(model => ({
            provider,
            id: model.id,
            name: model.name,
            inputModalities: this.modalities(model.id, model),
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
    /** Every model this provider's accounts have listed, newest knowledge first. */
    knownModels() {
        const known = new Map();
        for (const [account, cache] of this.accountCatalogs) {
            if (account === this.catalogOwner)
                continue;
            for (const model of cache.lastKnown() ?? [])
                known.set(model.id, model);
        }
        for (const model of this.catalog.lastKnown() ?? [])
            known.set(model.id, model);
        return [...known.values()];
    }
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
    fallbackModels(provider) {
        const models = new Map(this.staticModels(provider).map(model => [model.id, model]));
        for (const model of this.listed(provider, this.knownModels())) {
            if (!models.has(model.id))
                models.set(model.id, model);
        }
        return [...models.values()];
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
            // A gated network answers an empty catalog on every refresh: say so
            // once per adapter instead of on every picker read.
            const gated = error instanceof Error && /empty catalog/.test(error.message);
            if (!gated || !this.warnedEmptyCatalog) {
                this.options.onWarn?.(`muse model discovery failed; using the known catalog (${errorChain(error)})`);
            }
            if (gated)
                this.warnedEmptyCatalog = true;
            return this.fallbackModels(provider);
        }
    }
    /**
     * One live model-list request for this account, bypassing every cache and
     * every fallback (including the known catalog Meta gates some networks
     * with): the Settings probe must report what this account's own proxy
     * reached, and a stored or built-in catalog would say nothing.
     */
    async probeOwnModels(provider, account, signal) {
        if (!this.options.discovery)
            return this.staticModels(provider);
        return this.listed(provider, await this.fetchCatalog(account, signal));
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
            inputModalities: this.modalities(model, discovered),
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
            const messages = await resolveImages(options.messages, this.options.resolveAttachments?.(), watchdog.signal, MUSE_IMAGE_LIMIT);
            if (hostSupportsImageOffload()) {
                const offloadImages = requiredImageOffloadCount(messages, MUSE_REQUEST_IMAGE_BUDGET);
                if (offloadImages > 0) {
                    // Older dsh-llm option types lack `offloadImages`; 0.2+ hosts read it.
                    throw new LlmError(`muse request images exceed the ${String(MUSE_REQUEST_IMAGE_BUDGET)}-byte base64 budget; `
                        + `${String(offloadImages)} more oldest image(s) must be offloaded`, IMAGE_OFFLOAD_REQUIRED, { offloadImages });
                }
            }
            const replay = museReasoningIndex(options.messages, options.provider, options.model, accountKey);
            let replaying = replay.size > 0;
            const bodyOf = (history) => () => JSON.stringify(museRequestBody(options, toResponsesInput(history, options.system, replaying ? callId => replay.get(callId) : undefined)));
            const body = bodyOf(messages);
            const send = async (build) => {
                let response = await this.request(build(), session, options.sessionId, watchdog.signal);
                if (response.status === 401) {
                    // One forced re-mint + retry on an unexpired-but-rejected key.
                    await response.body?.cancel().catch(() => undefined);
                    session = await this.options.tokens.session(account, true);
                    response = await this.request(build(), session, options.sessionId, watchdog.signal);
                }
                if (response.status === 400 && replaying) {
                    // A gateway that rejects the replayed reasoning items must not break
                    // the conversation: retry once without them (the model re-derives).
                    await response.body?.cancel().catch(() => undefined);
                    replaying = false;
                    this.options.onWarn?.('muse rejected replayed reasoning items; retrying the request without them');
                    response = await this.request(build(), session, options.sessionId, watchdog.signal);
                }
                return response;
            };
            const backoff = this.options.modelNotFoundBackoffMs ?? MUSE_MODEL_NOT_FOUND_BACKOFF_MS;
            // A refused request from a blocked network poisons the model for the
            // whole account (other networks and devices too), so once one was seen,
            // check the network before sending again instead of re-poisoning it.
            // Keyed per model: a blocked network may still serve another model.
            const blockKey = `${accountKey ?? ''}\u0000${options.model}`;
            const blockedSince = this.blockedAt.get(blockKey);
            if (blockedSince !== undefined && this.now() - blockedSince < MUSE_BLOCKED_RECHECK_MS) {
                if (await museCatalogEmpty(session, this.fetchFn, watchdog.signal) === true) {
                    throw this.blockedNetwork(blockKey, false);
                }
                this.blockedAt.delete(blockKey);
            }
            let response = await send(body);
            let modelNotFound = false;
            for (let attempt = 0; response.status === 404; attempt++) {
                // Body read once here; a rebuilt Response carries it to the error path.
                const text = await response.text().catch(() => '');
                modelNotFound = MUSE_MODEL_NOT_FOUND.test(text);
                if (modelNotFound && attempt === 0 && await museCatalogEmpty(session, this.fetchFn, watchdog.signal) === true) {
                    // Blocked network: retrying only spreads the refusal to the account's
                    // other networks, so fail now (not retried, no pool cooldown).
                    throw this.blockedNetwork(blockKey, true);
                }
                if (!modelNotFound || attempt >= backoff.length) {
                    response = new Response(text, { status: 404, statusText: response.statusText, headers: response.headers });
                    break;
                }
                await sleep(backoff[attempt], watchdog.signal);
                response = await send(body);
            }
            if (!response.ok) {
                const error = await httpLlmError(response, 'muse API', {
                    rateLimitReset: museRateLimitReset,
                    ...this.options.onWarn === undefined ? {} : { onWarn: this.options.onWarn },
                });
                if (modelNotFound) {
                    // This network lists the catalog, so the account is still poisoned
                    // by earlier refusals on a blocked network; that clears within
                    // minutes. Report a server failure — the harness keeps retrying and
                    // a pool does not park the account — and name the cause instead of
                    // suggesting the model or account is wrong.
                    throw new LlmError(`${error.message}. ${MUSE_MODEL_NOT_FOUND_HINT} (still failing after ${String(backoff.length + 1)} attempts)`, 'SERVER', { status: 404, cause: error });
                }
                throw error;
            }
            if (response.body === null) {
                throw new LlmError('muse API returned no response body', EMPTY_RESPONSE_CODE);
            }
            // Everything but `usage` and `finish` is relayed as it arrives; those two
            // are held until the turn is known to be over, because a response that
            // ends early (see MUSE_DANGLING_STOP_NOTICE) is continued by a second
            // request whose chunks carry on the same assistant message.
            const first = newOutcome();
            const declared = new Set((options.tools ?? []).map(tool => tool.name));
            for await (const chunk of streamResponses(response.body, () => { watchdog.pulse(); }, museEventTap(captureInto(first), declared))) {
                recordChunk(first, chunk);
                if (chunk.type !== 'usage' && chunk.type !== 'finish')
                    yield chunk;
            }
            let kept = first;
            let dropped;
            if (this.endedEarly(first, options)) {
                this.options.onWarn?.('muse ended a turn with a short text-only reply; asking the model once whether it meant to carry on');
                const continued = yield* this.continueAfterAnnouncement({ options, history: messages, first, bodyOf, send, watchdog });
                if (continued?.kept === true) {
                    dropped = first;
                    kept = continued.outcome;
                }
                else
                    dropped = continued?.outcome;
            }
            const usage = museMergedUsage(kept.usage, dropped?.usage);
            if (usage !== undefined)
                yield { type: 'usage', usage };
            const finish = kept.finish;
            if (finish !== undefined) {
                if (finish.reason.kind === 'tool-calls' && kept.calls.length > 0 && kept.reasoning.length > 0) {
                    const state = {
                        kind: 'muse', version: 1, ...accountKey === undefined ? {} : { account: accountKey },
                        calls: kept.calls, reasoning: kept.reasoning,
                    };
                    yield { ...finish, replayState: { response: state } };
                }
                else {
                    yield finish;
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
    /**
     * Whether a finished response may be the early end described at
     * {@link MUSE_DANGLING_STOP_NOTICE}: a short text-only reply from a request
     * that offered tools. In the middle of a tool loop the reply only has to not
     * read as a final answer; on the first step of a turn, where the newest input
     * is the user's message, it has to announce the action it never performs.
     */
    endedEarly(first, options) {
        if (this.options.continueDanglingStop === false)
            return false;
        if (first.finish?.reason.kind !== 'stop')
            return false;
        if (first.toolCalls || first.calls.length > 0)
            return false;
        if ((options.tools?.length ?? 0) === 0)
            return false;
        const text = first.text.join('\n\n');
        return museMidToolLoop(options.messages) ? museDanglingText(text) : museAnnouncesAction(text);
    }
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
    async *continueAfterAnnouncement(input) {
        const { first, watchdog } = input;
        const body = input.bodyOf([
            ...input.history,
            { role: 'assistant', content: [{ type: 'text', text: first.text.join('\n\n') }] },
            { role: 'user', content: [{ type: 'text', text: MUSE_DANGLING_STOP_NOTICE }] },
        ]);
        const retries = this.options.continuationRetryMs ?? MUSE_CONTINUATION_RETRY_MS;
        let failure;
        for (let attempt = 0; attempt <= retries.length; attempt++) {
            const second = newOutcome();
            // Chunks wait here until the response proves it is a tool call; text
            // before that point is dropped with a text-only answer.
            const held = [];
            let committed = false;
            try {
                const response = await input.send(body);
                if (!response.ok || response.body === null) {
                    await response.body?.cancel().catch(() => undefined);
                    if (response.status < 500) {
                        this.options.onWarn?.(`muse continuation of a short text-only reply was refused (HTTP ${String(response.status)}); the turn ends as the model ended it`);
                        return undefined;
                    }
                    failure = new Error(`HTTP ${String(response.status)}`);
                }
                else {
                    const declared = new Set((input.options.tools ?? []).map(tool => tool.name));
                    for await (const chunk of streamResponses(response.body, () => { watchdog.pulse(); }, museEventTap(captureInto(second), declared))) {
                        recordChunk(second, chunk);
                        if (chunk.type === 'usage' || chunk.type === 'finish')
                            continue;
                        const placed = shiftedChunk(chunk, first.blocks);
                        if (committed) {
                            yield placed;
                            continue;
                        }
                        held.push(placed);
                        if (chunk.type === 'block-start' && chunk.blockType === 'tool-call') {
                            committed = true;
                            yield* held;
                            held.length = 0;
                        }
                    }
                    return { outcome: second, kept: committed };
                }
            }
            catch (error) {
                // Once the continuation has started to reach the harness, or when the
                // request was cancelled, the failure belongs to the caller.
                if (committed || watchdog.signal.aborted)
                    throw error;
                failure = error;
            }
            const wait = retries[attempt];
            if (wait === undefined)
                break;
            await sleep(wait, watchdog.signal);
        }
        this.options.onWarn?.(`muse continuation of a short text-only reply failed (${errorChain(failure)}); the turn ends as the model ended it`);
        return undefined;
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
