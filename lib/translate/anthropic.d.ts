/**
 * Translate between the harness message vocabulary and the Anthropic Messages
 * API wire format used by the claude provider: request message assembly, tool
 * schema mapping, and a push-model SSE-event → StreamChunk state machine
 * ({@link AnthropicStreamTranslator}) so tests need no streams.
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
import type { StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm';
import type { TranslatableMessage } from './resolved.js';
/**
 * The Claude Code identity block. The subscription endpoint rejects requests
 * that do not present as Claude Code, so this block is REQUIRED as the first
 * system entry on every request.
 */
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
 * Message breakpoints per request. Anthropic allows four in total: the last
 * `system` block and the last tool hold the tools+system prefix, so the
 * history gets the rest — enough to tolerate a turn appending roughly {@link
 * CACHE_BLOCK_STRIDE} × 2 blocks before a read is lost.
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
/** One Anthropic request message. */
export interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: Record<string, unknown>[];
}
/**
 * Tool result text for a `tool_use` the history never answered (an
 * interrupted or compacted turn). Anthropic rejects a call without a result,
 * so one is supplied; the model must not assume the call ran or did not.
 */
export declare const CLAUDE_UNKNOWN_TOOL_OUTCOME = "The tool call has no recorded result. Its outcome is unknown; verify external state before retrying any operation that may have side effects.";
/**
 * Per-block replay metadata, aligned with the emitted harness blocks.
 * `thinking` carries the signature Anthropic issued for a reasoning block
 * plus a digest of its text, so a history rewrite that shifted blocks cannot
 * pin a signature to the wrong reasoning. `redactedBefore` carries
 * `redacted_thinking` payloads that preceded the block on the wire (they have
 * no harness block of their own).
 */
export interface ClaudeBlockReplay {
    thinking?: {
        signature: string;
        digest: string;
    };
    redactedBefore?: string[];
}
/** Which historical assistant messages may replay their thinking: same route, same model. */
export interface ClaudeReplayScope {
    provider: string;
    model: string;
}
/**
 * Convert harness messages into Anthropic messages. Consecutive same-role
 * messages merge into one message with multiple content blocks; tool results
 * arrive as user messages with `tool_result` blocks, which a merged user
 * message keeps in one leading run ({@link leadWithToolResults}); system-role
 * messages before the conversation starts are handled by
 * {@link toAnthropicSystem} and skipped here, while a later one rides in
 * place as a user-role `<system-reminder>` block.
 * Reasoning replays as a signed `thinking` block only when `replay` names the
 * route and model that produced it and this translator's replay metadata
 * still matches the text; otherwise it is dropped (an unsigned or foreign
 * thinking block is rejected). Whitespace-only text blocks are dropped, as
 * Anthropic rejects them; tool pairing is repaired by request assembly
 * ({@link reconcileAnthropicToolPairs}). Images must arrive pre-resolved
 * ({@link TranslatableMessage}); an unresolved ImageBlock is skipped because
 * its bytes are unreachable here.
 * @param messages - ordered conversation messages with resolved images.
 * @param replay - the target route/model whose own thinking may be replayed.
 * @returns Anthropic messages in conversation order.
 */
export declare function toAnthropicMessages(messages: readonly TranslatableMessage[], replay?: ClaudeReplayScope): AnthropicMessage[];
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
 * @param messages - assembled Anthropic messages, marked in place.
 * @param marks - breakpoints to place; defaults to {@link
 * MESSAGE_CACHE_BREAKPOINTS}, the budget left for the history once the system
 * and tool anchors are placed (Anthropic allows four markers per request).
 */
export declare function markMessageCache(messages: readonly AnthropicMessage[], marks?: number): void;
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
        /** Initial thinking text / signature of a `thinking` block (usually empty). */
        thinking?: string;
        signature?: string;
        /** Encrypted payload of a `redacted_thinking` block. */
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
    private blocks;
    private nextIndex;
    private sawAnyBlock;
    private pendingUsage;
    private outputTokens;
    private stopReason;
    private refusalExplanation;
    private usageEmitted;
    /** Replay entries by harness block index. */
    private replay;
    /** `redacted_thinking` payloads waiting for the next harness block. */
    private pendingRedacted;
    /** Set once `message_stop` produced the terminal finish chunk. */
    terminated: boolean;
    private open;
    /** Close one block: record its replay entry and emit its `block-end`. */
    private close;
    /**
     * The replay envelope for a successful finish, one entry per emitted block;
     * undefined when the response carried no signed or redacted thinking, so
     * plain responses do not grow the session log.
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
 * @returns the chunk stream; throws when the stream ends before `message_stop`.
 */
export declare function streamAnthropic(stream: ReadableStream<Uint8Array>, onActivity?: () => void): AsyncGenerator<StreamChunk>;
