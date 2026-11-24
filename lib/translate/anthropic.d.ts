/**
 * Translate between the harness message vocabulary and the Anthropic Messages
 * API wire format used by the claude provider: request message assembly, tool
 * schema mapping, and a push-model SSE-event → StreamChunk state machine
 * ({@link AnthropicStreamTranslator}) so tests need no streams.
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
import type { ContentBlock, StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm';
import type { TranslatableBlock, TranslatableMessage } from './resolved.js';
/** The existing Claude system identity block, before the conversation's instructions. */
export declare const CLAUDE_CODE_IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude.";
/** Tags wrapping a mid-conversation system message where it sits in the history. */
export declare const SYSTEM_REMINDER_OPEN = "<system-reminder>";
export declare const SYSTEM_REMINDER_CLOSE = "</system-reminder>";
/**
 * How far apart consecutive message breakpoints sit, in content blocks.
 *
 * A breakpoint looks back at most 20 blocks for an entry an earlier request
 * wrote, so marks must stay closer than that: one agentic turn can append a
 * dozen tool_use/tool_result blocks at once, and a single trailing mark would
 * silently fall out of range and rebuild the whole prefix.
 */
export declare const CACHE_BLOCK_STRIDE = 15;
/**
 * Maximum conversation breakpoints after the system anchor. Anthropic allows
 * four in total, so a separate tool anchor leaves two for the conversation.
 */
export declare const MESSAGE_CACHE_BREAKPOINTS = 3;
/** The 1h anchor Claude Code pins the tools+system prefix with. */
export declare const CACHE_CONTROL_1H: {
    readonly type: "ephemeral";
    readonly ttl: "1h";
};
/**
 * The user turn appended when translation would otherwise leave the body
 * ending on an assistant turn. Newer models reject assistant prefill, and the
 * harness can lose its trailing turn here (an unresolved image block is
 * skipped), leaving the previous assistant reply as the body's last word.
 */
export declare const TRAILING_USER_PLACEHOLDER = "Continue.";
/**
 * How long Anthropic keeps a conversation cache entry after its last use:
 * five minutes (the API default) or one hour. The tools+system prefix is
 * always pinned at one hour ({@link CACHE_CONTROL_1H}), as Claude Code does;
 * this TTL applies to the conversation marks only. A one-hour entry is written at twice the base
 * input price instead of 1.25×, and reads cost the same either way.
 */
export type PromptCacheTtl = '5m' | '1h';
/** The API default; a marker at this TTL carries no `ttl` field at all. */
export declare const DEFAULT_PROMPT_CACHE_TTL: PromptCacheTtl;
/**
 * Build one `cache_control` marker.
 *
 * Five minutes is spelled by omitting `ttl`, so a request that does not opt in
 * stays byte-identical to what earlier releases sent.
 * @param ttl - cache lifetime; defaults to five minutes.
 * @returns a fresh marker object (callers attach it to one block each).
 */
export declare function cacheControl(ttl?: PromptCacheTtl): Record<string, unknown>;
/** One Anthropic request message. */
export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: Record<string, unknown>[];
}
/** Tool result text for a call interrupted before its outcome was recorded. */
export declare const CLAUDE_UNKNOWN_TOOL_OUTCOME = "The tool call has no recorded result. Its outcome is unknown; verify external state before retrying any operation that may have side effects.";
/**
 * What a response's thinking is bound to, recorded with the response.
 *
 * Anthropic binds each returned `thinking` / `redacted_thinking` block to its
 * prefix (the top-level `system`, the set of `tools`, and everything before
 * the block in `messages`, thinking blocks and cache markers aside) and to the
 * thinking block that preceded it. A block sent back after its prefix changed
 * fails the server's check: it is silently dropped or the request is rejected
 * (HTTP 400), depending on the account. Recording the binding lets a later
 * request tell, before sending, which blocks are still valid. See
 * https://platform.claude.com/docs/en/build-with-claude/preserved-thinking#prefix-check
 */
export interface ThinkingBinding {
    /** {@link prefixDigest} of the request the response was produced for. */
    prefix: string;
    /** {@link replayDigest} of the last thinking block that request sent; null when it sent none. */
    prev: string | null;
    /**
     * Set on the response to a request sent after the API refused replayed
     * thinking: no thinking from before that response is sent again.
     */
    reset?: true;
}
/**
 * Response-level part of the replay envelope this translator emits. The tag
 * keeps a history entry written by another adapter (or another envelope
 * shape) from being read as Anthropic thinking metadata, and a response
 * recorded without its binding is never replayed.
 */
export interface AnthropicReplayResponse extends Partial<ThinkingBinding> {
    kind: 'anthropic';
    version: 2;
    /** {@link responseContentDigest} of the response's own non-thinking content, as streamed. */
    content?: string;
}
/**
 * Per-block replay metadata, aligned with the emitted blocks: a `thinking`
 * block keeps its signature, a `redacted_thinking` block keeps its opaque
 * payload, and every other block needs nothing.
 */
export type AnthropicBlockReplay = Record<string, never> | {
    signature: string;
    thinkingDigest?: string;
} | {
    redactedData: string;
};
/** Harness text standing in for a `redacted_thinking` block, which carries no readable reasoning. */
export declare const REDACTED_THINKING_TEXT = "[Reasoning redacted]";
/** A short, stable identity for one thinking block's signature or redacted payload. */
export declare function replayDigest(opaque: string): string;
/**
 * Digest of the request-level part of every thinking block's prefix: the
 * `system` blocks, and the `tools` compared as a set (their order does not
 * matter to the check), without cache markers.
 * @param system - the request's `system` blocks.
 * @param tools - the request's `tools`, when it sends any.
 * @returns the digest each message-level prefix digest starts from.
 */
export declare function requestBaseDigest(system: readonly Record<string, unknown>[], tools?: readonly Record<string, unknown>[]): string;
/**
 * Digest of one assistant response's non-thinking content in wire form. A
 * thinking block that follows text or a tool call of its own response is bound
 * to that content too, so replay also requires the stored response to be
 * unchanged.
 */
export declare function responseContentDigest(blocks: readonly (TranslatableBlock | ContentBlock)[]): string;
/**
 * How one request replays thinking: the route and concrete model it targets
 * and the {@link requestBaseDigest} of its own `system` and `tools`.
 *
 * This plugin conservatively replays thinking only to the same concrete
 * provider, account and model that produced it (the account through
 * {@link streamAccountWithReplay}). Some models support cross-model thinking
 * replay; this plugin does not enable it.
 */
export interface ThinkingReplayContext {
    provider: string;
    model: string;
    base: string;
    /** Send no thinking at all: the one-time fallback after the API refused replayed thinking. */
    disabled?: boolean;
}
/**
 * Whether an HTTP failure is the API refusing a replayed thinking block:
 * ``messages.N.content.M: Invalid `signature` in `thinking` block`` (a
 * signature it cannot verify, or one bound to a different prefix) or an
 * invalid `redacted_thinking` payload. Resending the same body fails the same
 * way; dropping the replayed thinking does not.
 */
export declare function isRefusedThinkingError(error: LlmError): boolean;
/** The messages to send, plus the binding the response to them must record. */
export interface AnthropicMessagesAssembly {
    messages: AnthropicMessage[];
    binding: ThinkingBinding;
    /** How many thinking / redacted_thinking blocks are replayed. */
    replayedThinking: number;
}
/**
 * Convert harness messages into Anthropic messages. Consecutive same-role
 * messages merge into one message with multiple content blocks; tool results
 * arrive as user messages with `tool_result` blocks, which a merged user
 * message keeps in one leading run ({@link leadWithToolResults}); system-role
 * messages before the conversation starts are handled by
 * {@link toAnthropicSystem} and skipped here, while a later one rides in
 * place as a user-role `<system-reminder>` block.
 * Images must arrive pre-resolved ({@link TranslatableMessage}); an
 * unresolved ImageBlock is skipped because its bytes are unreachable here.
 *
 * Reasoning blocks are replayed as signed `thinking` / `redacted_thinking`
 * blocks, in their original position, only for responses of the request's
 * own route and model whose binding still holds ({@link selectThinking}):
 * the prefix each was produced after is computed here from the request being
 * built, so a changed system prompt, tool set or earlier message drops the
 * thinking that depended on it while the rest of the history is sent as before.
 *
 * Tool-call ids the Messages API refuses, such as the OpenAI Codex route's
 * `call_…|fc_…`, go out in an accepted form that is the same on every request
 * ({@link anthropicToolIds}); accepted ids and the stored history are unchanged.
 * @param messages - ordered conversation messages with resolved images.
 * @param replay - the request's route, model and request-level prefix;
 * omitted, no reasoning is replayed.
 * @param repairRequest - apply Claude's request-only history repairs before hashing.
 * @returns the messages and the binding the response to them must record.
 */
export declare function assembleAnthropicMessages(messages: readonly TranslatableMessage[], replay?: ThinkingReplayContext, repairRequest?: boolean): AnthropicMessagesAssembly;
/**
 * Convert harness messages into Anthropic messages ({@link assembleAnthropicMessages}).
 * @param messages - ordered conversation messages with resolved images.
 * @param replay - the request's route, model and request-level prefix; omitted, no reasoning is replayed.
 * @returns Anthropic messages in conversation order.
 */
export declare function toAnthropicMessages(messages: readonly TranslatableMessage[], replay?: ThinkingReplayContext): AnthropicMessage[];
/**
 * Restore Anthropic's tool pairing: every `tool_use` must be answered by a
 * `tool_result` leading the next user message, and every `tool_result` must
 * answer a `tool_use` in the assistant message right before it — either
 * violation is a 400 that fails every later turn of the session. A missing
 * result (an interrupted or compacted turn) is supplied as an error result
 * marking the outcome unknown; an orphan or duplicate result rides as text
 * instead. Only the request is repaired; the durable history is untouched.
 * @param messages - assembled messages, leading tool-result runs already in place.
 * @returns the balanced messages (the same objects where nothing changed).
 */
export declare function reconcileAnthropicToolPairs(messages: readonly AnthropicMessage[]): AnthropicMessage[];
/**
 * Mark the conversation's cache breakpoints in place: the last content block,
 * then one every {@link CACHE_BLOCK_STRIDE} blocks backwards, `marks` in total.
 *
 * The history is append-only, so the block one request marks last is
 * byte-identical in the next — that entry is what the next request reads.
 * Marks are counted across the flattened block sequence, not per message,
 * because the lookback window Anthropic walks counts blocks the same way.
 *
 * Anthropic rejects a `cache_control` on a `thinking` or `redacted_thinking`
 * block (HTTP 400), so a mark that would land on one moves to the nearest
 * earlier block that can carry it, without counting the same marker twice.
 * @param messages - assembled Anthropic messages, marked in place.
 * @param ttl - cache lifetime for every mark; defaults to five minutes. The
 * tools+system anchor is always 1h, so a 5m or 1h mark here never follows a
 * shorter one (Anthropic rejects a 1h breakpoint behind a 5m one).
 * @param marks - breakpoints to place; defaults to {@link
 * MESSAGE_CACHE_BREAKPOINTS}, the budget left for the history once the system
 * and tool anchors are placed (Anthropic allows four markers per request).
 */
export declare function markMessageCache(messages: readonly AnthropicMessage[], ttl?: PromptCacheTtl, marks?: number): void;
/**
 * Build the Anthropic `system` array: the mandatory Claude Code identity
 * block, then the explicit system prompt, then any system-role messages.
 * @param system - explicit system prompt, when set.
 * @param messages - conversation messages; the system-role text preceding the
 * conversation is appended, and a later one is left to {@link toAnthropicMessages}.
 * @returns the system content blocks.
 */
export declare function toAnthropicSystem(system?: string, messages?: readonly TranslatableMessage[]): Record<string, unknown>[];
/**
 * Map harness tool schemas to Anthropic tools, in name order.
 *
 * `tools` renders at position 0 of the cached prefix, so any reordering
 * invalidates every cache entry behind it — `system` and the whole
 * conversation included. Registration order belongs to the caller and plugin
 * load order can differ between processes, so the wire order is fixed here
 * instead. Anthropic selects a tool by name; the array order carries nothing.
 * The last entry carries the 1h anchor for the tools+system prefix — one
 * marker here rather than one per tool keeps the four-marker budget intact.
 * @param tools - tool schemas from the request.
 * @returns Anthropic `tools` array entries, ordered by tool name.
 */
export declare function toAnthropicTools(tools: readonly ToolSchema[]): Record<string, unknown>[];
/** Name of the server-side tool search tool this adapter adds (regex variant). */
export declare const TOOL_SEARCH_TOOL_NAME = "tool_search_tool_regex";
/** Version tag of the regex tool search tool, as documented for the Messages API. */
export declare const TOOL_SEARCH_TOOL_TYPE = "tool_search_tool_regex_20251119";
/**
 * Whether a tool name matches one `claudeDeferTools` pattern. A pattern is a
 * literal name, or a literal prefix followed by a single trailing `*`
 * (`mcp__*`); a bare `*` matches everything. Nothing else is a wildcard, so
 * a pattern can never be a regular expression a model or a config typo could
 * turn into something unexpected.
 * @param name - tool name.
 * @param pattern - one configured pattern.
 * @returns true when the pattern covers the name.
 */
export declare function matchesDeferPattern(name: string, pattern: string): boolean;
/** Options for {@link toAnthropicToolsDeferred}. */
export interface DeferredToolsOptions {
    /** Name patterns whose tools are sent with `defer_loading: true`. */
    deferPatterns: readonly string[];
}
/**
 * Like {@link toAnthropicTools}, with deferred loading and the tool search
 * tool added. A tool is deferred when DSH marked it (`deferLoading`) or when
 * its name matches one of `deferPatterns`.
 *
 * The API rejects a request in which every tool is deferred, but the search
 * tool is itself a loaded tool, so deferring every other tool is valid
 * (verified against the endpoint). It is added only when something is
 * actually deferred; otherwise the output equals {@link toAnthropicTools}.
 * The API also rejects `cache_control` on a deferred tool: this function never
 * adds one, and the request body places its cache mark on `system`. The wire
 * order stays name-sorted for the existing cache-prefix reason, with the
 * search tool first so that the deferred set never moves a loaded tool.
 * @param tools - tool schemas from the request.
 * @param options - defer rule.
 * @returns Anthropic `tools` array entries.
 */
export declare function toAnthropicToolsDeferred(tools: readonly ToolSchema[], options: DeferredToolsOptions): Record<string, unknown>[];
/** The subset of Anthropic SSE event shapes this translator reads. */
export interface AnthropicStreamEvent {
    type: string;
    index?: number;
    message?: {
        usage?: {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
        };
    };
    content_block?: {
        type?: string;
        id?: string;
        name?: string;
        /** `thinking` blocks: text and signature may already be present at start. */
        thinking?: string;
        signature?: string;
        /** `redacted_thinking` blocks: the encrypted reasoning payload. */
        data?: string;
    };
    delta?: {
        type?: string;
        text?: string;
        thinking?: string;
        signature?: string;
        partial_json?: string;
        stop_reason?: string;
        /** Anthropic's explanation accompanying a `refusal` stop. */
        stop_details?: {
            explanation?: string;
        };
    };
    usage?: {
        output_tokens?: number;
        /** Cumulative across server-side iterations (tool search); absent on ordinary replies. */
        input_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
    };
    error?: {
        type?: string;
        message?: string;
    };
}
/**
 * Classify an Anthropic `error` event into a thrown LlmError.
 * @param error - the wire error object.
 * @returns the mapped error.
 */
export declare function anthropicFailure(error: {
    type?: string;
    message?: string;
} | undefined): LlmError;
/**
 * Push-model Anthropic SSE translator: feed each parsed event object to
 * {@link push} and collect the emitted harness StreamChunks. Block indexes
 * are allocated in first-seen order; `usage` is emitted before the terminal
 * `finish`, and nothing is emitted after it. `error` events throw
 * {@link LlmError}. A successful finish carries a replay envelope holding
 * each thinking block's signature, so the next request of the tool loop can
 * hand Anthropic its own signed reasoning back ({@link toAnthropicMessages}).
 */
export declare class AnthropicStreamTranslator {
    private readonly binding?;
    private blocks;
    /** Replay entry per emitted block, by harness index. */
    private replay;
    /** Each emitted block, by harness index, for the response-content digest. */
    private emitted;
    /** Set once any block carries a signature or redacted payload worth replaying. */
    private sawSignedThinking;
    private nextIndex;
    /**
     * @param binding - what the request this response answers is bound to
     * ({@link assembleAnthropicMessages}); without it the response's thinking
     * is recorded unbound and never replayed.
     */
    constructor(binding?: ThinkingBinding | undefined);
    private sawAnyBlock;
    private pendingUsage;
    private outputTokens;
    private stopReason;
    private refusalExplanation;
    private usageEmitted;
    /** Set once `message_stop` produced the terminal finish chunk. */
    terminated: boolean;
    private open;
    /** Emit one block's `block-end` and record its replay entry. */
    private close;
    /**
     * The finish envelope: each thinking block's signature aligned with the
     * emitted blocks, plus the binding of the request it answered and a digest
     * of the response's own content. Absent when no block needs replay
     * metadata, so a response without signed thinking stores exactly what it
     * did before.
     */
    private replayState;
    private emitUsage;
    /**
     * Process one parsed Anthropic SSE event.
     * @param event - the parsed event object.
     * @returns the StreamChunks this event produced (possibly none).
     */
    push(event: AnthropicStreamEvent): StreamChunk[];
}
/**
 * Consume an Anthropic SSE byte stream and yield harness StreamChunks.
 * @param stream - raw response body.
 * @param onActivity - transport-activity callback for the idle watchdog.
 * @param binding - what the request is bound to, recorded with its thinking.
 * @returns the chunk stream; throws when the stream ends before `message_stop`.
 */
export declare function streamAnthropic(stream: ReadableStream<Uint8Array>, onActivity?: () => void, binding?: ThinkingBinding): AsyncGenerator<StreamChunk>;
