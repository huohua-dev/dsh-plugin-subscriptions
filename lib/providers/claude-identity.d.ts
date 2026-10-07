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
/** The entrypoint label Claude Code presents; the user-agent suffix agrees with it. */
export declare const CLAUDE_ENTRYPOINT = "sdk-cli";
/** Anthropic SDK build the genuine CLI's client reports (X-Stainless-Package-Version). */
export declare const CLAUDE_SDK_PACKAGE_VERSION = "0.80.0";
/** Node runtime build the genuine CLI's client reports (X-Stainless-Runtime-Version). */
export declare const CLAUDE_SDK_RUNTIME_VERSION = "v24.14.0";
/** The User-Agent Claude Code sends at `version`. */
export declare function claudeCliUserAgent(version: string): string;
/**
 * The `anthropic-beta` set for one request: the CLI's current flag set, with
 * the heavy-agent flags gated to the opus/sonnet families and `redact-thinking`
 * omitted when thinking summaries were requested.
 * @param model - requested model id.
 * @param summarizedThinking - the request sets `thinking.display: 'summarized'`.
 * @returns the comma-joined beta flag list.
 */
export declare function claudeBetaFlags(model: string, summarizedThinking?: boolean): string;
/**
 * The Anthropic SDK telemetry headers the genuine CLI's client attaches to
 * every request. Static apart from the host's os/arch, matching the CLI's own
 * node-based transport.
 */
export declare function claudeStainlessHeaders(): Record<string, string>;
/**
 * The billing-attribution token Claude Code sends as `system[0]`: the client
 * version it presents, its entrypoint, and a short content hash of the request
 * body the token is prepended to.
 * @param body - the request body before the token is inserted.
 * @param cliVersion - the Claude Code version presented in the user-agent.
 * @returns the full text block, `x-anthropic-billing-header:` included.
 */
export declare function claudeBillingHeader(body: Record<string, unknown>, cliVersion: string): string;
/**
 * The `metadata.user_id` Claude Code sends: a JSON triple of a stable device
 * id, a stable account uuid, and the conversation's session id — the same
 * session id `x-claude-code-session-id` carries.
 * @param stableId - per-account seed (an email or the token); device and
 * account ids derive from it, so they survive token rotation.
 * @param sessionHeaderId - the conversation session id to embed.
 * @returns the JSON string.
 */
export declare function claudeFakeUserId(stableId: string, sessionHeaderId: string): string;
/** A request body after Claude Code identity is applied, plus its session header. */
export interface ClaudeIdentity {
    body: Record<string, unknown>;
    /** Value for `x-claude-code-session-id`, aligned with `metadata.user_id.session_id`. */
    sessionHeaderId?: string;
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
export declare function applyClaudeCodeIdentity(body: Record<string, unknown>, accessToken: string, cliVersion: string, sessionId?: string, stableId?: string): ClaudeIdentity;
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
export declare function claudeRequestHeaders(accessToken: string, cliVersion: string, model: string, summarizedThinking?: boolean, sessionHeaderId?: string): Record<string, string>;
