/**
 * Claude Code client identity for the subscription endpoint.
 *
 * Anthropic routes OAuth (`sk-ant-oat`) traffic by the request's client
 * presentation: requests that carry the billing-attribution token Claude Code
 * puts at `system[0]` draw from the subscription plan, everything else is
 * billed as a third-party app against "extra usage" (HTTP 400 when the account
 * has none). This module assembles that presentation — the billing block, the
 * Claude Code `metadata.user_id` shape, the CLI user-agent and the Stainless
 * SDK headers — so the wire shape matches the genuine CLI surface.
 */
import { createHash, randomBytes } from 'node:crypto';
import { deterministicSessionId } from './common.js';
/** The entrypoint label Claude Code presents; the user-agent suffix agrees with it. */
export const CLAUDE_ENTRYPOINT = 'sdk-cli';
/** Anthropic SDK build the genuine CLI's client reports (X-Stainless-Package-Version). */
export const CLAUDE_SDK_PACKAGE_VERSION = '0.80.0';
/** Node runtime build the genuine CLI's client reports (X-Stainless-Runtime-Version). */
export const CLAUDE_SDK_RUNTIME_VERSION = 'v24.14.0';
/** Only OAuth traffic is gated by the billing block; API keys keep the plain API shape. */
const CLAUDE_OAUTH_TOKEN_PREFIX = 'sk-ant-oat';
/** Billing-token field order is part of the token's wire shape. */
const CLAUDE_BILLING_PREFIX = 'x-anthropic-billing-header:';
/** The User-Agent Claude Code sends at `version`. */
export function claudeCliUserAgent(version) {
    return `claude-cli/${version} (external, ${CLAUDE_ENTRYPOINT})`;
}
const CLAUDE_BETA_BASE = [
    'claude-code-20250219',
    'oauth-2025-04-20',
    'interleaved-thinking-2025-05-14',
    'context-management-2025-06-27',
    'prompt-caching-scope-2026-01-05',
    'structured-outputs-2025-12-15',
    'fast-mode-2026-02-01',
    'redact-thinking-2026-02-12',
    'token-efficient-tools-2026-03-28',
];
/** Heavy-agent capabilities, sent for the opus/sonnet families like the CLI does. */
const CLAUDE_BETA_HEAVY_AGENT = ['advanced-tool-use-2025-11-20', 'effort-2025-11-24'];
/**
 * Asks Anthropic for signature-only thinking blocks, which blanks the
 * summaries a `thinking.display: "summarized"` request explicitly asked for —
 * dropped whenever the request wants those summaries.
 */
const CLAUDE_BETA_REDACT_THINKING = 'redact-thinking-2026-02-12';
/**
 * The `anthropic-beta` set for one request: the CLI's current flag set, with
 * the heavy-agent flags gated to the opus/sonnet families and `redact-thinking`
 * omitted when thinking summaries were requested.
 * @param model - requested model id.
 * @param summarizedThinking - the request sets `thinking.display: 'summarized'`.
 * @returns the comma-joined beta flag list.
 */
export function claudeBetaFlags(model, summarizedThinking = false) {
    const flags = CLAUDE_BETA_BASE.filter(flag => flag !== CLAUDE_BETA_REDACT_THINKING || !summarizedThinking);
    if (/^claude-(opus|sonnet)/.test(model))
        flags.push(...CLAUDE_BETA_HEAVY_AGENT);
    return flags.join(',');
}
/** X-Stainless-Os value for a Node platform id. */
function stainlessOs(platform = process.platform) {
    switch (platform) {
        case 'darwin': return 'MacOS';
        case 'win32': return 'Windows';
        case 'linux': return 'Linux';
        case 'freebsd': return 'FreeBSD';
        default: return `Other::${platform}`;
    }
}
/** X-Stainless-Arch value for a Node arch id. */
function stainlessArch(arch = process.arch) {
    switch (arch) {
        case 'x64': return 'x64';
        case 'arm64': return 'arm64';
        case 'ia32': return 'x86';
        default: return `other::${arch}`;
    }
}
/**
 * The Anthropic SDK telemetry headers the genuine CLI's client attaches to
 * every request. Static apart from the host's os/arch, matching the CLI's own
 * node-based transport.
 */
export function claudeStainlessHeaders() {
    return {
        'x-stainless-helper-method': 'stream',
        'x-stainless-retry-count': '0',
        'x-stainless-runtime-version': CLAUDE_SDK_RUNTIME_VERSION,
        'x-stainless-package-version': CLAUDE_SDK_PACKAGE_VERSION,
        'x-stainless-runtime': 'node',
        'x-stainless-lang': 'js',
        'x-stainless-arch': stainlessArch(),
        'x-stainless-os': stainlessOs(),
        'x-stainless-timeout': '600',
    };
}
/**
 * The billing-attribution token Claude Code sends as `system[0]`: the client
 * version it presents, its entrypoint, and a short content hash of the request
 * body the token is prepended to.
 * @param body - the request body before the token is inserted.
 * @param cliVersion - the Claude Code version presented in the user-agent.
 * @returns the full text block, `x-anthropic-billing-header:` included.
 */
export function claudeBillingHeader(body, cliVersion) {
    const cch = createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 5);
    const build = randomBytes(2).toString('hex').slice(0, 3);
    return `${CLAUDE_BILLING_PREFIX} cc_version=${cliVersion}.${build}; cc_entrypoint=${CLAUDE_ENTRYPOINT}; cch=${cch};`;
}
/** Stable uuid-v4-shaped id derived from a seed (stable per account). */
function deriveUuid(seed) {
    const hash = createHash('sha256').update(seed).digest('hex');
    return [
        hash.slice(0, 8),
        hash.slice(8, 12),
        `4${hash.slice(13, 16)}`,
        `${((parseInt(hash[16], 16) & 0x3) | 0x8).toString(16)}${hash.slice(17, 20)}`,
        hash.slice(20, 32),
    ].join('-');
}
/**
 * The `metadata.user_id` Claude Code sends: a JSON triple of a stable device
 * id, a stable account uuid, and the conversation's session id — the same
 * session id `x-claude-code-session-id` carries.
 * @param stableId - per-account seed (an email or the token); device and
 * account ids derive from it, so they survive token rotation.
 * @param sessionHeaderId - the conversation session id to embed.
 * @returns the JSON string.
 */
export function claudeFakeUserId(stableId, sessionHeaderId) {
    return JSON.stringify({
        device_id: createHash('sha256').update(`device:${stableId}`).digest('hex'),
        account_uuid: deriveUuid(`account:${stableId}`),
        session_id: sessionHeaderId,
    });
}
/**
 * Present an OAuth request as genuine Claude Code: the billing-attribution
 * token as `system[0]` (ahead of the identity line), the Claude Code
 * `metadata.user_id` shape, and the session id the request headers echo.
 * API-key traffic keeps the plain API shape — the billing gate reads OAuth
 * only. The billing hash covers the body as passed, before this insertion.
 * @param body - the assembled request body.
 * @param accessToken - the credential; `sk-ant-oat` selects the OAuth lane.
 * @param cliVersion - the Claude Code version presented in the user-agent.
 * @param sessionId - the conversation's session id; a UUID is minted when absent.
 * @param stableId - per-account seed for the device/account ids (defaults to the token).
 * @returns the identity-adjusted body and the session header value.
 */
export function applyClaudeCodeIdentity(body, accessToken, cliVersion, sessionId, stableId = accessToken) {
    if (!accessToken.includes(CLAUDE_OAUTH_TOKEN_PREFIX)) {
        return sessionId === undefined
            ? { body }
            : { body: { ...body, metadata: { user_id: String(sessionId) } } };
    }
    const cleanSession = sessionId === undefined ? '' : String(sessionId).replace(/^claude:/i, '').trim();
    // UUID-shaped like the genuine CLI's session ids; non-UUID harness ids are
    // hashed into one (the codex route's deterministicSessionId convention).
    const sessionHeaderId = deterministicSessionId(cleanSession.length > 0 ? cleanSession : undefined);
    const billing = { type: 'text', text: claudeBillingHeader(body, cliVersion) };
    const system = Array.isArray(body.system)
        ? [billing, ...body.system]
        : typeof body.system === 'string' && body.system.length > 0
            ? [billing, { type: 'text', text: body.system }]
            : [billing];
    return {
        body: {
            ...body,
            system,
            metadata: { user_id: claudeFakeUserId(stableId, sessionHeaderId) },
        },
        sessionHeaderId,
    };
}
/**
 * The full header set for one Messages API request: CLI identity, the model's
 * beta flags, the Stainless SDK telemetry, and the session header aligned with
 * `metadata.user_id`.
 * @param accessToken - the credential, sent as a bearer token.
 * @param cliVersion - the Claude Code version to present.
 * @param model - requested model id, gating the heavy-agent beta flags.
 * @param summarizedThinking - the request sets `thinking.display: 'summarized'`.
 * @param sessionHeaderId - `metadata.user_id.session_id` when the request is OAuth.
 * @returns the header map.
 */
export function claudeRequestHeaders(accessToken, cliVersion, model, summarizedThinking = false, sessionHeaderId) {
    return {
        'authorization': `Bearer ${accessToken}`,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': claudeBetaFlags(model, summarizedThinking),
        'user-agent': claudeCliUserAgent(cliVersion),
        'x-app': 'cli',
        'anthropic-dangerous-direct-browser-access': 'true',
        'accept': 'text/event-stream',
        'content-type': 'application/json',
        ...claudeStainlessHeaders(),
        ...sessionHeaderId === undefined ? {} : { 'x-claude-code-session-id': sessionHeaderId },
    };
}
