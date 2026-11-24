/**
 * Translate between the harness message vocabulary and the Anthropic Messages
 * API wire format used by the claude provider: request message assembly, tool
 * schema mapping, and a push-model SSE-event → StreamChunk state machine
 * ({@link AnthropicStreamTranslator}) so tests need no streams.
 */
import { createHash } from 'node:crypto';
import { CONTEXT_WINDOW_EXCEEDED_CODE, EMPTY_RESPONSE_CODE, LlmError, QUOTA_EXCEEDED_CODE, } from '@deepseek-ai/dsh-llm';
import { ToolCallId } from '../compat.js';
import { isSubscriptionQuotaExceeded } from '../providers/quota.js';
import { parseSse } from './sse.js';
/** The existing Claude system identity block, before the conversation's instructions. */
export const CLAUDE_CODE_IDENTITY = 'You are Claude Code, Anthropic\'s official CLI for Claude.';
/** Tags wrapping a mid-conversation system message where it sits in the history. */
export const SYSTEM_REMINDER_OPEN = '<system-reminder>';
export const SYSTEM_REMINDER_CLOSE = '</system-reminder>';
/**
 * How far apart consecutive message breakpoints sit, in content blocks.
 *
 * A breakpoint looks back at most 20 blocks for an entry an earlier request
 * wrote, so marks must stay closer than that: one agentic turn can append a
 * dozen tool_use/tool_result blocks at once, and a single trailing mark would
 * silently fall out of range and rebuild the whole prefix.
 */
export const CACHE_BLOCK_STRIDE = 15;
/**
 * Maximum conversation breakpoints after the system anchor. Anthropic allows
 * four in total, so a separate tool anchor leaves two for the conversation.
 */
export const MESSAGE_CACHE_BREAKPOINTS = 3;
/** The 1h anchor Claude Code pins the tools+system prefix with. */
export const CACHE_CONTROL_1H = { type: 'ephemeral', ttl: '1h' };
/**
 * The user turn appended when translation would otherwise leave the body
 * ending on an assistant turn. Newer models reject assistant prefill, and the
 * harness can lose its trailing turn here (an unresolved image block is
 * skipped), leaving the previous assistant reply as the body's last word.
 */
export const TRAILING_USER_PLACEHOLDER = 'Continue.';
/** The API default; a marker at this TTL carries no `ttl` field at all. */
export const DEFAULT_PROMPT_CACHE_TTL = '5m';
/**
 * Build one `cache_control` marker.
 *
 * Five minutes is spelled by omitting `ttl`, so a request that does not opt in
 * stays byte-identical to what earlier releases sent.
 * @param ttl - cache lifetime; defaults to five minutes.
 * @returns a fresh marker object (callers attach it to one block each).
 */
export function cacheControl(ttl = DEFAULT_PROMPT_CACHE_TTL) {
    return ttl === '1h' ? { type: 'ephemeral', ttl: '1h' } : { type: 'ephemeral' };
}
/** Tool result text for a call interrupted before its outcome was recorded. */
export const CLAUDE_UNKNOWN_TOOL_OUTCOME = 'The tool call has no recorded result. Its outcome is unknown; verify external state before retrying any operation that may have side effects.';
/** Harness text standing in for a `redacted_thinking` block, which carries no readable reasoning. */
export const REDACTED_THINKING_TEXT = '[Reasoning redacted]';
/** Locally check that a history rewrite did not edit the text under a signature. */
function thinkingDigest(text) {
    return createHash('sha256').update(text, 'utf16le').digest('base64url').slice(0, 22);
}
/** A short, stable identity for one thinking block's signature or redacted payload. */
export function replayDigest(opaque) {
    return createHash('sha256').update(opaque, 'utf8').digest('base64url').slice(0, 22);
}
/** JSON with object keys sorted, so equal content always hashes equally. */
function canonicalJson(value) {
    if (Array.isArray(value))
        return `[${value.map(canonicalJson).join(',')}]`;
    if (value !== null && typeof value === 'object') {
        const record = value;
        return `{${Object.keys(record).sort()
            .filter(key => record[key] !== undefined)
            .map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}
/** A wire block as the prefix check sees it: cache markers are not part of the prefix. */
function prefixView(block) {
    if (!('cache_control' in block))
        return block;
    const { cache_control: _marker, ...rest } = block;
    return rest;
}
/** Whether a wire block is a thinking block, which Anthropic does not accept a `cache_control` on. */
function isThinkingBlock(block) {
    return block.type === 'thinking' || block.type === 'redacted_thinking';
}
/**
 * Digest of the request-level part of every thinking block's prefix: the
 * `system` blocks, and the `tools` compared as a set (their order does not
 * matter to the check), without cache markers.
 * @param system - the request's `system` blocks.
 * @param tools - the request's `tools`, when it sends any.
 * @returns the digest each message-level prefix digest starts from.
 */
export function requestBaseDigest(system, tools = []) {
    const set = tools.map(tool => canonicalJson(prefixView(tool))).sort();
    return createHash('sha256')
        .update(canonicalJson(system.map(prefixView)))
        .update(`\u0000${set.join('\u0000')}`)
        .digest('base64url');
}
/** A running prefix digest: the request base, then each non-thinking block with its role. */
function prefixHash(base) {
    return createHash('sha256').update(base);
}
function hashBlock(hash, role, block) {
    hash.update(`\u0001${role}\u0000${canonicalJson(prefixView(block))}`);
}
function prefixDigest(hash) {
    return hash.copy().digest('base64url').slice(0, 32);
}
/**
 * The wire block an assistant message's non-reasoning block is sent as;
 * undefined for blocks the Messages API does not accept there.
 * @param toolId - the id a tool call is sent with: {@link anthropicToolIds}
 * in a request, the stored id where the response-content digest is taken.
 */
function assistantWireBlock(block, toolId) {
    switch (block.type) {
        case 'text':
            return { type: 'text', text: block.text };
        case 'tool-call':
            return { type: 'tool_use', id: toolId(String(block.id)), name: block.name, input: parseToolInput(block.arguments) };
        case 'image':
            return 'dataBase64' in block
                ? { type: 'image', source: { type: 'base64', media_type: block.mediaType, data: block.dataBase64 } }
                : undefined;
        default:
            return undefined;
    }
}
/**
 * Digest of one assistant response's non-thinking content in wire form. A
 * thinking block that follows text or a tool call of its own response is bound
 * to that content too, so replay also requires the stored response to be
 * unchanged.
 */
export function responseContentDigest(blocks) {
    const hash = createHash('sha256');
    for (const block of blocks) {
        // Stored ids: the digest is recorded while streaming, before any request maps them.
        const wire = assistantWireBlock(block, id => id);
        if (wire !== undefined)
            hash.update(`${canonicalJson(wire)}\u0000`);
    }
    return hash.digest('base64url').slice(0, 22);
}
/** Read the stored replay metadata of a history: responses of the request's own route and model only. */
function replayHistory(messages, replay) {
    const history = { responses: [], candidates: [], responseOf: new Map(), slots: new Map() };
    if (replay === undefined)
        return history;
    for (const [messageIndex, message] of messages.entries()) {
        if (message.role !== 'assistant')
            continue;
        const source = message.source;
        if (source?.kind !== 'model' || source.provider !== replay.provider || source.model !== replay.model)
            continue;
        const state = source.replayState;
        if (state === null || typeof state !== 'object')
            continue;
        const envelope = state;
        const response = envelope.response;
        if (response === null || typeof response !== 'object' || response.kind !== 'anthropic' || response.version !== 2)
            continue;
        const entries = envelope.blocks;
        if (!Array.isArray(entries) || entries.length !== message.content.length)
            continue;
        const binding = {
            ...typeof response.prefix === 'string' ? { prefix: response.prefix } : {},
            ...response.prev === null || typeof response.prev === 'string' ? { prev: response.prev } : {},
            ...response.reset === true ? { reset: true } : {},
        };
        const index = history.responses.push({
            binding,
            contentIntact: typeof response.content === 'string' && response.content === responseContentDigest(message.content),
        }) - 1;
        history.responseOf.set(messageIndex, index);
        // The first thinking block followed whatever the request sent last; each
        // later one follows the previous thinking block of the same response.
        let predecessor = binding.prev;
        const slots = new Map();
        for (const [position, block] of message.content.entries()) {
            if (block.type !== 'reasoning')
                continue;
            const entry = entries[position];
            let wire;
            let digest;
            if (entry !== null && typeof entry === 'object' && typeof entry.redactedData === 'string' && entry.redactedData.length > 0) {
                wire = { type: 'redacted_thinking', data: entry.redactedData };
                digest = replayDigest(entry.redactedData);
            }
            else if (entry !== null && typeof entry === 'object' && typeof entry.signature === 'string' && entry.signature.length > 0
                // Older v2 envelopes did not include the local per-block digest.
                && (entry.thinkingDigest === undefined || entry.thinkingDigest === thinkingDigest(block.text))) {
                // The text goes back exactly as it was received, with its signature.
                wire = { type: 'thinking', thinking: block.text, signature: entry.signature };
                digest = replayDigest(entry.signature);
            }
            if (wire !== undefined && digest !== undefined && predecessor !== undefined) {
                slots.set(position, history.candidates.push({ block: wire, digest, predecessor, response: index }) - 1);
            }
            // An unsigned block breaks the chain: nothing after it in this response can be placed.
            predecessor = digest;
        }
        if (slots.size > 0)
            history.slots.set(messageIndex, slots);
    }
    return history;
}
/**
 * Pick the thinking blocks to send.
 *
 * The API accepts a replayed block only when its prefix is what it was when the
 * block was produced, and when the thinking block sent right before it is the
 * one it followed. The blocks kept must be an unbroken run of the original
 * sequence: the oldest or the newest may be left out, a middle one may not,
 * and one left out must stay out, because later blocks were produced without
 * it. So the run starts at the newest block whose prefix still matches and
 * follows each block's recorded predecessor backwards, stopping at the first
 * block that is missing, changed, or older than a refusal.
 * @returns the candidate indexes to send.
 */
function selectThinking(history, replay) {
    const chosen = new Set();
    if (replay === undefined || replay.disabled === true)
        return chosen;
    let barrier = -1;
    for (const [index, response] of history.responses.entries())
        if (response.binding.reset === true)
            barrier = index;
    const usable = (index) => {
        const candidate = history.candidates[index];
        const response = history.responses[candidate.response];
        return candidate.response >= barrier && response.contentIntact
            && response.binding.prefix !== undefined && response.binding.prefix === response.prefixHere;
    };
    let at = -1;
    for (let index = history.candidates.length - 1; index >= 0; index--)
        if (usable(index)) {
            at = index;
            break;
        }
    while (at >= 0) {
        chosen.add(at);
        const predecessor = history.candidates[at].predecessor;
        if (predecessor === null)
            break;
        let previous = -1;
        for (let earlier = at - 1; earlier >= 0; earlier--) {
            if (history.candidates[earlier].digest === predecessor) {
                previous = earlier;
                break;
            }
        }
        at = previous !== -1 && usable(previous) ? previous : -1;
    }
    return chosen;
}
/**
 * Whether an HTTP failure is the API refusing a replayed thinking block:
 * ``messages.N.content.M: Invalid `signature` in `thinking` block`` (a
 * signature it cannot verify, or one bound to a different prefix) or an
 * invalid `redacted_thinking` payload. Resending the same body fails the same
 * way; dropping the replayed thinking does not.
 */
export function isRefusedThinkingError(error) {
    return error.failure.status === 400
        && /Invalid `(?:signature|data)` in `(?:redacted_)?thinking` block/.test(error.message);
}
/** Preserve native image blocks, retaining the existing text-only wire shape. */
function toolResultContent(block) {
    if (!block.content.some(part => part.type === 'image' && 'dataBase64' in part)) {
        return block.content.map(part => (part.type === 'text' ? part.text : '')).join('');
    }
    const content = [];
    for (const part of block.content) {
        if (part.type === 'text' && part.text.length > 0)
            content.push({ type: 'text', text: part.text });
        if (part.type === 'image' && 'dataBase64' in part) {
            content.push({ type: 'image', source: { type: 'base64', media_type: part.mediaType, data: part.dataBase64 } });
        }
    }
    return content;
}
/** Parse a tool call's raw JSON arguments into Anthropic's object-shaped `input`. */
function parseToolInput(raw) {
    try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed;
        }
        return {};
    }
    catch {
        // The model produced malformed JSON; an empty object keeps the request valid.
        return {};
    }
}
/**
 * The ids the Messages API accepts in `tool_use.id` and
 * `tool_result.tool_use_id`. Any other id is refused with HTTP 400:
 * ``messages.N.content.M.tool_use.id: String should match pattern '^[a-zA-Z0-9_-]+$'``.
 */
const ANTHROPIC_TOOL_ID = /^[a-zA-Z0-9_-]+$/;
/** Longest id {@link generatedToolId} builds; Anthropic's own ids are shorter. */
const GENERATED_TOOL_ID_MAX_LENGTH = 64;
/** Base64url digest characters closing a generated id (96 bits). */
const GENERATED_TOOL_ID_DIGEST = 16;
/** The call id a tool-role message answers: its own correlation field, else the call its source names. */
function toolMessageCallId(message) {
    const id = message.toolCallId ?? message.tool_call_id
        ?? (message.source?.kind === 'tool' ? message.source.callId : undefined);
    return id === undefined ? undefined : String(id);
}
/**
 * The accepted id sent for a refused one: the original with every run of
 * refused characters replaced by `_`, cut short, then a digest of the whole
 * original. It stays readable next to the history, uses only accepted
 * characters (base64url included), and depends on nothing but the original
 * and the attempt. Requests already sent depend on this exact form: a change
 * rewrites the cached prefix and drops recorded thinking of switched sessions.
 * @param id - the stored id, which the API refuses.
 * @param attempt - 0, or how many candidates were already taken in this request.
 */
function generatedToolId(id, attempt) {
    const digest = createHash('sha256')
        .update(attempt === 0 ? id : `${attempt}\u0000${id}`, id.isWellFormed() ? 'utf8' : 'utf16le')
        .digest('base64url');
    const stem = id.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, GENERATED_TOOL_ID_MAX_LENGTH - GENERATED_TOOL_ID_DIGEST - 1);
    return `${stem}_${digest.slice(0, GENERATED_TOOL_ID_DIGEST)}`;
}
/**
 * The wire id of every tool call and tool result in one request.
 *
 * A session can switch providers, so its history can hold calls another
 * route produced, with ids the Messages API refuses: the OpenAI Codex route
 * records `call_…|fc_…`. Such ids are rewritten here, in the request only;
 * the stored history keeps its own.
 *
 * - An accepted id is sent verbatim, so a request whose ids are all accepted
 *   is byte-identical to one built without this step.
 * - A refused id becomes {@link generatedToolId}. Its first candidate depends
 *   only on the original, so every request of a session sends the same id and
 *   the cached prefix and the thinking prefix check keep matching. Only a later
 *   call already holding that exact candidate (a 96-bit digest match) moves
 *   it: one cache miss, never a refused request.
 * - No two ids share a wire id: every accepted id is reserved first, and a
 *   generated id already taken is derived again. A call and the results that
 *   answer it carry the same stored id, so they stay paired whichever history
 *   format names the call.
 * @param messages - the request's messages.
 * @returns the wire id of a stored tool-call id.
 */
function anthropicToolIds(messages) {
    const stored = new Set();
    for (const message of messages) {
        const answered = message.role === 'tool' ? toolMessageCallId(message) : undefined;
        if (answered !== undefined)
            stored.add(answered);
        for (const block of message.content) {
            if (block.type === 'tool-call')
                stored.add(String(block.id));
            else if (block.type === 'tool-result')
                stored.add(String(block.toolCallId));
        }
    }
    const taken = new Set([...stored].filter(id => ANTHROPIC_TOOL_ID.test(id)));
    const generated = new Map();
    for (const id of stored) {
        if (ANTHROPIC_TOOL_ID.test(id))
            continue;
        let attempt = 0;
        let wire = generatedToolId(id, attempt);
        while (taken.has(wire))
            wire = generatedToolId(id, ++attempt);
        taken.add(wire);
        generated.set(id, wire);
    }
    return id => generated.get(id) ?? id;
}
/**
 * Move a user message's `tool_result` blocks into one contiguous run at the
 * front, preserving the relative order of both groups.
 *
 * Anthropic answers every `tool_use` against the blocks that *lead* the next
 * message, so a block of any other kind before or between the results reads
 * as a call left unanswered and the request is rejected. The harness merges
 * everything queued for one user turn into a single message, and a parallel
 * tool batch arrives as one result message per call, so any context spliced
 * mid-batch lands between two results. Restoring the run here keeps that
 * independent of delivery order. Order *among* the results does not matter.
 * @param message - one assembled user message, reordered in place.
 */
function leadWithToolResults(message) {
    const firstOther = message.content.findIndex(block => block.type !== 'tool_result');
    if (firstOther === -1)
        return;
    if (!message.content.slice(firstOther).some(block => block.type === 'tool_result'))
        return;
    message.content = [
        ...message.content.filter(block => block.type === 'tool_result'),
        ...message.content.filter(block => block.type !== 'tool_result'),
    ];
}
/**
 * Index of the first non-system message; `messages.length` when every message
 * is a system one.
 *
 * A system message before the conversation starts is the operator's opening
 * instruction and belongs in the `system` slot. One that arrives later is
 * mid-conversation context, and hoisting it into `system` would move bytes in
 * front of the whole history — invalidating every cached turn behind it — so
 * it stays where it is, as a reminder block in `messages`.
 * @param messages - ordered conversation messages.
 * @returns the boundary index separating the two.
 */
function conversationStart(messages) {
    const index = messages.findIndex(message => message.role !== 'system');
    return index === -1 ? messages.length : index;
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
export function assembleAnthropicMessages(messages, replay, repairRequest = false) {
    const history = replayHistory(messages, replay);
    const toolId = anthropicToolIds(messages);
    const out = [];
    /** Placeholder object of each candidate, so the final position is known before choosing. */
    const placeholders = new Map();
    const responseStarts = new Map();
    const start = conversationStart(messages);
    for (const [index, message] of messages.entries()) {
        // A leading system message is an opening instruction; toAnthropicSystem
        // owns those. A later one rides here so the cached prefix ahead of it
        // stays byte-identical.
        if (message.role === 'system' && index < start)
            continue;
        const role = message.role === 'assistant' ? 'assistant' : 'user';
        const blocks = [];
        if (message.role === 'tool') {
            const id = toolMessageCallId(message);
            if (id === undefined)
                throw new LlmError('tool result has no call id', 'INVALID_REQUEST');
            blocks.push({
                type: 'tool_result',
                tool_use_id: toolId(id),
                content: toolResultContent({ type: 'tool-result', toolCallId: ToolCallId(id), content: message.content }),
                ...message.isError === true ? { is_error: true } : {},
            });
            const last = out[out.length - 1];
            if (last?.role === 'user')
                last.content.push(...blocks);
            else
                out.push({ role: 'user', content: blocks });
            continue;
        }
        const slots = history.slots.get(index);
        for (const [position, block] of message.content.entries()) {
            switch (block.type) {
                case 'reasoning': {
                    const candidate = slots?.get(position);
                    if (candidate !== undefined) {
                        const placeholder = { type: 'thinking' };
                        placeholders.set(placeholder, candidate);
                        blocks.push(placeholder);
                    }
                    break;
                }
                case 'text':
                    // Anthropic rejects text blocks without non-whitespace text.
                    if (block.text.trim().length === 0)
                        break;
                    blocks.push({
                        type: 'text',
                        text: message.role === 'system'
                            ? `${SYSTEM_REMINDER_OPEN}${block.text}${SYSTEM_REMINDER_CLOSE}`
                            : block.text,
                    });
                    break;
                case 'tool-call':
                    // Anthropic accepts `tool_use` only in assistant messages, and only
                    // when a matching `tool_result` follows. A tool call in any other
                    // role is replayed narrative — a settled subagent's closing message
                    // spliced into the parent as a user-role notice carries the calls it
                    // died holding, which no result will ever answer — so it rides as
                    // descriptive text instead of a call the API would reject.
                    blocks.push(role === 'assistant'
                        ? assistantWireBlock(block, toolId)
                        : { type: 'text', text: `[tool call ${block.name}: ${block.arguments}]` });
                    break;
                case 'tool-result':
                    blocks.push({
                        type: 'tool_result',
                        tool_use_id: toolId(String(block.toolCallId)),
                        content: toolResultContent(block),
                        ...block.isError === true ? { is_error: true } : {},
                    });
                    break;
                case 'image':
                    if ('dataBase64' in block) {
                        blocks.push({
                            type: 'image',
                            source: { type: 'base64', media_type: block.mediaType, data: block.dataBase64 },
                        });
                    }
                    // An unresolved ImageBlock carries only an attachment reference; the
                    // adapter resolves images before translation, so this is skipped.
                    break;
                default:
                    // Unknown blocks carry nothing the Messages API accepts.
                    break;
            }
        }
        if (blocks.length === 0)
            continue;
        const response = history.responseOf.get(index);
        if (response !== undefined)
            responseStarts.set(blocks[0], response);
        const last = out[out.length - 1];
        if (last?.role === role)
            last.content.push(...blocks);
        else
            out.push({ role, content: blocks });
    }
    // Hash the projected request, not the raw history. If a thinking-only
    // message disappears, rebuild from the unedited projection: merging roles
    // can change which tool results pair, or whether a trailing turn is needed.
    const dropped = new Set();
    let working;
    let chosen;
    let hash;
    for (;;) {
        const merged = [];
        for (const message of out) {
            const content = message.content.filter(block => !dropped.has(block));
            if (content.length === 0)
                continue;
            const last = merged[merged.length - 1];
            if (last?.role === message.role)
                last.content.push(...content);
            else
                merged.push({ role: message.role, content });
        }
        for (const message of merged)
            if (message.role === 'user')
                leadWithToolResults(message);
        working = repairRequest ? reconcileAnthropicToolPairs(merged) : merged;
        if (repairRequest && working[working.length - 1]?.role === 'assistant'
            && messages[messages.length - 1]?.role !== 'assistant') {
            working.push({ role: 'user', content: [{ type: 'text', text: TRAILING_USER_PLACEHOLDER }] });
        }
        hash = prefixHash(replay?.base ?? '');
        for (const response of history.responses)
            delete response.prefixHere;
        for (const message of working) {
            // A response merged into the middle of an existing turn has no valid
            // response boundary at which to replay its thinking.
            const response = responseStarts.get(message.content[0]);
            if (response !== undefined)
                history.responses[response].prefixHere = prefixDigest(hash);
            hash.update(`\u0002${message.role}`);
            for (const block of message.content)
                if (!placeholders.has(block))
                    hashBlock(hash, message.role, block);
        }
        chosen = selectThinking(history, replay);
        const before = dropped.size;
        for (const message of working) {
            if (message.content.every(block => placeholders.has(block) && !chosen.has(placeholders.get(block)))) {
                for (const block of message.content)
                    dropped.add(block);
            }
        }
        if (dropped.size === before)
            break;
    }
    let prev = null;
    let replayed = 0;
    const finalMessages = working.map(message => ({
        role: message.role,
        content: message.content.flatMap(block => {
            const candidate = placeholders.get(block);
            if (candidate === undefined)
                return [block];
            if (!chosen.has(candidate))
                return [];
            replayed += 1;
            prev = history.candidates[candidate].digest;
            return [history.candidates[candidate].block];
        }),
    }));
    return {
        messages: finalMessages,
        binding: {
            prefix: prefixDigest(hash),
            prev: replay?.disabled === true ? null : prev,
            ...replay?.disabled === true ? { reset: true } : {},
        },
        replayedThinking: replayed,
    };
}
/**
 * Convert harness messages into Anthropic messages ({@link assembleAnthropicMessages}).
 * @param messages - ordered conversation messages with resolved images.
 * @param replay - the request's route, model and request-level prefix; omitted, no reasoning is replayed.
 * @returns Anthropic messages in conversation order.
 */
export function toAnthropicMessages(messages, replay) {
    return assembleAnthropicMessages(messages, replay).messages;
}
/** Plain text of a `tool_result`'s content, for riding an orphan result as text. */
function toolResultText(content) {
    if (typeof content === 'string')
        return content;
    if (!Array.isArray(content))
        return '';
    return content
        .map(part => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
        .join('');
}
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
export function reconcileAnthropicToolPairs(messages) {
    const out = [];
    for (const [index, message] of messages.entries()) {
        if (message.role === 'assistant') {
            out.push(message);
            const calls = [...new Set(message.content
                    .filter(block => block.type === 'tool_use')
                    .map(block => String(block.id)))];
            if (calls.length === 0)
                continue;
            const next = messages[index + 1];
            const answered = new Set(next?.role === 'user'
                ? next.content.filter(block => block.type === 'tool_result').map(block => String(block.tool_use_id))
                : []);
            // A next user turn is answered (or repaired) in its own pass below.
            if (next?.role === 'user')
                continue;
            const missing = calls.filter(id => !answered.has(id));
            if (missing.length > 0) {
                out.push({ role: 'user', content: missing.map(id => unknownToolOutcome(id)) });
            }
            continue;
        }
        const previous = out[out.length - 1];
        const calls = previous?.role === 'assistant'
            ? [...new Set(previous.content.filter(block => block.type === 'tool_use').map(block => String(block.id)))]
            : [];
        const callSet = new Set(calls);
        const seen = new Set();
        let changed = false;
        const content = message.content.map((block) => {
            if (block.type !== 'tool_result')
                return block;
            const id = String(block.tool_use_id);
            if (callSet.has(id) && !seen.has(id)) {
                seen.add(id);
                return block;
            }
            changed = true;
            const text = toolResultText(block.content);
            return { type: 'text', text: `[tool result ${id}: ${text.length > 0 ? text : '(empty)'}]` };
        });
        const missing = calls.filter(id => !seen.has(id));
        if (!changed && missing.length === 0) {
            out.push(message);
            continue;
        }
        const repaired = { role: 'user', content: [...missing.map(id => unknownToolOutcome(id)), ...content] };
        leadWithToolResults(repaired);
        out.push(repaired);
    }
    return out;
}
/** The error `tool_result` standing in for a call the history never answered. */
function unknownToolOutcome(id) {
    return { type: 'tool_result', tool_use_id: id, content: CLAUDE_UNKNOWN_TOOL_OUTCOME, is_error: true };
}
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
export function markMessageCache(messages, ttl, marks = MESSAGE_CACHE_BREAKPOINTS) {
    const blocks = messages.flatMap(message => message.content);
    let floor = blocks.length;
    for (let mark = 0; mark < marks; mark++) {
        let at = Math.min(blocks.length - 1 - mark * CACHE_BLOCK_STRIDE, floor - 1);
        while (at >= 0 && isThinkingBlock(blocks[at]))
            at -= 1;
        if (at < 0)
            return;
        blocks[at].cache_control = cacheControl(ttl);
        floor = at;
    }
}
/**
 * Build the Anthropic `system` array: the mandatory Claude Code identity
 * block, then the explicit system prompt, then any system-role messages.
 * @param system - explicit system prompt, when set.
 * @param messages - conversation messages; the system-role text preceding the
 * conversation is appended, and a later one is left to {@link toAnthropicMessages}.
 * @returns the system content blocks.
 */
export function toAnthropicSystem(system, messages) {
    const blocks = [{ type: 'text', text: CLAUDE_CODE_IDENTITY }];
    if (system !== undefined && system.length > 0)
        blocks.push({ type: 'text', text: system });
    const history = messages ?? [];
    for (const message of history.slice(0, conversationStart(history))) {
        for (const block of message.content) {
            if (block.type === 'text')
                blocks.push({ type: 'text', text: block.text });
        }
    }
    // `tools` renders ahead of `system`, so this one marker caches both. It is
    // deliberately separate from the message marks: a tool_choice or thinking
    // change invalidates the messages tier only, and this entry survives it.
    // The 1h TTL is what Claude Code pins the tools+system prefix with; the
    // conversation marks stay on the 5m default.
    blocks[blocks.length - 1].cache_control = { ...CACHE_CONTROL_1H };
    return blocks;
}
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
export function toAnthropicTools(tools) {
    const sorted = [...tools]
        .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
        .map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters,
    }));
    if (sorted.length > 0)
        sorted[sorted.length - 1].cache_control = { ...CACHE_CONTROL_1H };
    return sorted;
}
/** Name of the server-side tool search tool this adapter adds (regex variant). */
export const TOOL_SEARCH_TOOL_NAME = 'tool_search_tool_regex';
/** Version tag of the regex tool search tool, as documented for the Messages API. */
export const TOOL_SEARCH_TOOL_TYPE = 'tool_search_tool_regex_20251119';
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
export function matchesDeferPattern(name, pattern) {
    if (pattern.length === 0)
        return false;
    if (pattern.endsWith('*'))
        return name.startsWith(pattern.slice(0, -1));
    return name === pattern;
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
export function toAnthropicToolsDeferred(tools, options) {
    const isDeferred = (tool) => tool.deferLoading === true || options.deferPatterns.some(pattern => matchesDeferPattern(tool.name, pattern));
    const deferred = tools.filter(isDeferred);
    if (deferred.length === 0)
        return toAnthropicTools(tools);
    const deferredNames = new Set(deferred.map(tool => tool.name));
    return [
        { type: TOOL_SEARCH_TOOL_TYPE, name: TOOL_SEARCH_TOOL_NAME },
        ...toAnthropicTools(tools).map(({ cache_control: _anchor, ...entry }) => (deferredNames.has(entry.name) ? { ...entry, defer_loading: true } : entry)),
    ];
}
/** The replay entry one closed block contributes to the finish envelope. */
function blockReplay(block) {
    if (block.kind !== 'reasoning')
        return {};
    if (block.redactedData !== undefined && block.redactedData.length > 0)
        return { redactedData: block.redactedData };
    if (block.signature !== undefined && block.signature.length > 0) {
        return { signature: block.signature, thinkingDigest: thinkingDigest(block.text) };
    }
    return {};
}
/** Assemble the final ContentBlock for one open block. */
function closeBlock(block) {
    switch (block.kind) {
        case 'text':
            return { type: 'text', text: block.text };
        case 'reasoning':
            return { type: 'reasoning', text: block.text };
        case 'tool-call':
            return {
                type: 'tool-call',
                id: ToolCallId(block.callId),
                name: block.name ?? '',
                arguments: block.text,
            };
    }
}
/**
 * Classify an Anthropic `error` event into a thrown LlmError.
 * @param error - the wire error object.
 * @returns the mapped error.
 */
export function anthropicFailure(error) {
    const type = error?.type ?? 'unknown_error';
    const message = error?.message ?? `Anthropic reported ${type}`;
    switch (type) {
        case 'invalid_request_error':
            if (/prompt is too long/i.test(message))
                return new LlmError(message, CONTEXT_WINDOW_EXCEEDED_CODE);
            // The request itself is at fault: resending it verbatim fails the same
            // way, so it must stay outside the retryable SERVER code.
            return new LlmError(message, 'INVALID_REQUEST');
        case 'not_found_error':
        case 'request_too_large':
            return new LlmError(message, 'INVALID_REQUEST');
        case 'rate_limit_error':
            return isSubscriptionQuotaExceeded(message)
                ? new LlmError(`Subscription quota exhausted: ${message}`, QUOTA_EXCEEDED_CODE)
                : new LlmError(message, 'RATE_LIMIT');
        case 'authentication_error':
        case 'permission_error':
            return new LlmError(message, 'AUTH');
        case 'billing_error':
            return new LlmError(message, QUOTA_EXCEEDED_CODE);
        default:
            // overloaded_error, api_error, and unknown types are transient.
            return new LlmError(message, 'SERVER');
    }
}
/**
 * Push-model Anthropic SSE translator: feed each parsed event object to
 * {@link push} and collect the emitted harness StreamChunks. Block indexes
 * are allocated in first-seen order; `usage` is emitted before the terminal
 * `finish`, and nothing is emitted after it. `error` events throw
 * {@link LlmError}. A successful finish carries a replay envelope holding
 * each thinking block's signature, so the next request of the tool loop can
 * hand Anthropic its own signed reasoning back ({@link toAnthropicMessages}).
 */
export class AnthropicStreamTranslator {
    binding;
    blocks = new Map();
    /** Replay entry per emitted block, by harness index. */
    replay = [];
    /** Each emitted block, by harness index, for the response-content digest. */
    emitted = [];
    /** Set once any block carries a signature or redacted payload worth replaying. */
    sawSignedThinking = false;
    nextIndex = 0;
    /**
     * @param binding - what the request this response answers is bound to
     * ({@link assembleAnthropicMessages}); without it the response's thinking
     * is recorded unbound and never replayed.
     */
    constructor(binding) {
        this.binding = binding;
    }
    sawAnyBlock = false;
    pendingUsage;
    outputTokens;
    stopReason = 'stop';
    refusalExplanation;
    usageEmitted = false;
    /** Set once `message_stop` produced the terminal finish chunk. */
    terminated = false;
    open(wireIndex, kind, chunks, callId = '', name) {
        const block = {
            index: this.nextIndex++,
            kind,
            text: '',
            callId,
            ...name === undefined ? {} : { name },
        };
        this.blocks.set(wireIndex, block);
        this.sawAnyBlock = true;
        chunks.push({ type: 'block-start', index: block.index, blockType: kind });
        return block;
    }
    /** Emit one block's `block-end` and record its replay entry. */
    close(block, chunks) {
        const entry = blockReplay(block);
        if (Object.keys(entry).length > 0)
            this.sawSignedThinking = true;
        this.replay[block.index] = entry;
        const content = closeBlock(block);
        this.emitted[block.index] = content;
        chunks.push({ type: 'block-end', index: block.index, block: content });
    }
    /**
     * The finish envelope: each thinking block's signature aligned with the
     * emitted blocks, plus the binding of the request it answered and a digest
     * of the response's own content. Absent when no block needs replay
     * metadata, so a response without signed thinking stores exactly what it
     * did before.
     */
    replayState() {
        // A response to a request sent after a refusal records the refusal even
        // without thinking of its own, so older thinking is never resent.
        if (!this.sawSignedThinking && this.binding?.reset !== true)
            return undefined;
        const blocks = [];
        for (let index = 0; index < this.nextIndex; index++)
            blocks.push(this.replay[index] ?? {});
        const emitted = this.emitted.filter((block) => block !== undefined);
        const response = {
            kind: 'anthropic',
            version: 2,
            ...this.binding === undefined ? {} : {
                prefix: this.binding.prefix,
                prev: this.binding.prev,
                ...this.binding.reset === true ? { reset: true } : {},
            },
            content: responseContentDigest(emitted),
        };
        return { response, blocks };
    }
    emitUsage(chunks) {
        if (this.usageEmitted)
            return;
        this.usageEmitted = true;
        const usage = {
            inputTokens: this.pendingUsage?.inputTokens ?? 0,
            outputTokens: this.outputTokens ?? 0,
            ...this.pendingUsage?.cacheReadTokens !== undefined
                ? { cacheReadTokens: this.pendingUsage.cacheReadTokens }
                : {},
            ...this.pendingUsage?.cacheWriteTokens !== undefined
                ? { cacheWriteTokens: this.pendingUsage.cacheWriteTokens }
                : {},
        };
        chunks.push({ type: 'usage', usage });
    }
    /**
     * Process one parsed Anthropic SSE event.
     * @param event - the parsed event object.
     * @returns the StreamChunks this event produced (possibly none).
     */
    push(event) {
        if (this.terminated)
            return [];
        const chunks = [];
        switch (event.type) {
            case 'message_start': {
                const usage = event.message?.usage;
                if (usage !== undefined) {
                    this.pendingUsage = {
                        inputTokens: usage.input_tokens ?? 0,
                        ...usage.cache_read_input_tokens !== undefined
                            ? { cacheReadTokens: usage.cache_read_input_tokens }
                            : {},
                        ...usage.cache_creation_input_tokens !== undefined
                            ? { cacheWriteTokens: usage.cache_creation_input_tokens }
                            : {},
                    };
                    this.outputTokens = usage.output_tokens ?? this.outputTokens;
                }
                return chunks;
            }
            case 'content_block_start': {
                const wireIndex = event.index ?? 0;
                const block = event.content_block;
                switch (block?.type) {
                    case 'text':
                        this.open(wireIndex, 'text', chunks);
                        break;
                    case 'thinking': {
                        const opened = this.open(wireIndex, 'reasoning', chunks);
                        // Both fields normally arrive empty and fill in through deltas;
                        // keep whatever the start event already carries.
                        if (typeof block.signature === 'string' && block.signature.length > 0)
                            opened.signature = block.signature;
                        if (typeof block.thinking === 'string' && block.thinking.length > 0) {
                            opened.text = block.thinking;
                            chunks.push({ type: 'reasoning-delta', index: opened.index, text: block.thinking });
                        }
                        break;
                    }
                    case 'redacted_thinking': {
                        // Encrypted reasoning: nothing readable to show, but the payload
                        // must go back verbatim for the model to keep its reasoning.
                        const opened = this.open(wireIndex, 'reasoning', chunks);
                        opened.text = REDACTED_THINKING_TEXT;
                        if (typeof block.data === 'string')
                            opened.redactedData = block.data;
                        chunks.push({ type: 'reasoning-delta', index: opened.index, text: REDACTED_THINKING_TEXT });
                        break;
                    }
                    case 'tool_use': {
                        const opened = this.open(wireIndex, 'tool-call', chunks, block.id ?? '', block.name);
                        chunks.push({
                            type: 'tool-call-delta',
                            index: opened.index,
                            id: ToolCallId(opened.callId),
                            ...block.name === undefined ? {} : { name: block.name },
                            argumentsDelta: '',
                        });
                        break;
                    }
                    default:
                        break;
                }
                return chunks;
            }
            case 'content_block_delta': {
                const wireIndex = event.index ?? 0;
                const block = this.blocks.get(wireIndex);
                const delta = event.delta;
                if (block === undefined || delta === undefined)
                    return chunks;
                switch (delta.type) {
                    case 'text_delta':
                        block.text += delta.text ?? '';
                        chunks.push({ type: 'text-delta', index: block.index, text: delta.text ?? '' });
                        break;
                    case 'thinking_delta':
                        block.text += delta.thinking ?? '';
                        chunks.push({ type: 'reasoning-delta', index: block.index, text: delta.thinking ?? '' });
                        break;
                    case 'input_json_delta':
                        block.text += delta.partial_json ?? '';
                        chunks.push({
                            type: 'tool-call-delta',
                            index: block.index,
                            id: ToolCallId(block.callId),
                            ...block.name === undefined ? {} : { name: block.name },
                            argumentsDelta: delta.partial_json ?? '',
                        });
                        break;
                    case 'signature_delta':
                        // Not harness content: the signature rides in the finish
                        // envelope so the next request can replay this thinking block.
                        if (block.kind === 'reasoning')
                            block.signature = (block.signature ?? '') + (delta.signature ?? '');
                        break;
                    default:
                        // Future deltas carry no harness content.
                        break;
                }
                return chunks;
            }
            case 'content_block_stop': {
                const wireIndex = event.index ?? 0;
                const block = this.blocks.get(wireIndex);
                if (block === undefined)
                    return chunks;
                this.blocks.delete(wireIndex);
                this.close(block, chunks);
                return chunks;
            }
            case 'message_delta': {
                if (event.usage?.output_tokens !== undefined)
                    this.outputTokens = event.usage.output_tokens;
                // When the server runs a tool search inside the turn, `message_start` reports only the first iteration's input;
                // `message_delta` then carries the cumulative total. Replace the start figures only for the fields it sends,
                // so an ordinary reply (no input fields in the delta) keeps reporting exactly what it did before.
                const total = event.usage;
                if (total !== undefined && (total.input_tokens !== undefined
                    || total.cache_read_input_tokens !== undefined || total.cache_creation_input_tokens !== undefined)) {
                    this.pendingUsage = {
                        inputTokens: total.input_tokens ?? this.pendingUsage?.inputTokens ?? 0,
                        ...(total.cache_read_input_tokens ?? this.pendingUsage?.cacheReadTokens) !== undefined
                            ? { cacheReadTokens: (total.cache_read_input_tokens ?? this.pendingUsage?.cacheReadTokens) }
                            : {},
                        ...(total.cache_creation_input_tokens ?? this.pendingUsage?.cacheWriteTokens) !== undefined
                            ? { cacheWriteTokens: (total.cache_creation_input_tokens ?? this.pendingUsage?.cacheWriteTokens) }
                            : {},
                    };
                }
                switch (event.delta?.stop_reason) {
                    case 'end_turn':
                    case 'stop_sequence':
                        this.stopReason = 'stop';
                        break;
                    case 'tool_use':
                        this.stopReason = 'tool-calls';
                        break;
                    case 'max_tokens':
                    // Output ran into the model's context window: truncated like max_tokens.
                    case 'model_context_window_exceeded':
                        this.stopReason = 'max-tokens';
                        break;
                    case 'refusal':
                        this.stopReason = 'refusal';
                        this.refusalExplanation = event.delta?.stop_details?.explanation;
                        break;
                    default:
                        break;
                }
                return chunks;
            }
            case 'message_stop': {
                this.terminated = true;
                for (const [wireIndex, block] of [...this.blocks]) {
                    this.blocks.delete(wireIndex);
                    this.close(block, chunks);
                }
                this.emitUsage(chunks);
                if (this.stopReason === 'refusal') {
                    // The safety classifier stopped the turn; retrying it verbatim
                    // refuses again, so it fails with Anthropic's own explanation.
                    const explanation = this.refusalExplanation?.trim();
                    chunks.push({
                        type: 'finish',
                        reason: {
                            kind: 'error',
                            failure: {
                                message: explanation !== undefined && explanation.length > 0
                                    ? `Claude declined to continue: ${explanation}`
                                    : 'Claude declined to continue this response (stop_reason: refusal)',
                                code: 'CONTENT_FILTER',
                            },
                        },
                    });
                }
                else if (this.stopReason === 'stop' && !this.sawAnyBlock) {
                    chunks.push({
                        type: 'finish',
                        reason: {
                            kind: 'error',
                            failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
                        },
                    });
                }
                else {
                    const replayState = this.replayState();
                    chunks.push({
                        type: 'finish',
                        reason: { kind: this.stopReason },
                        ...replayState === undefined ? {} : { replayState },
                    });
                }
                return chunks;
            }
            case 'error':
                throw anthropicFailure(event.error);
            default:
                // ping and future event types carry no harness content.
                return chunks;
        }
    }
}
/**
 * Consume an Anthropic SSE byte stream and yield harness StreamChunks.
 * @param stream - raw response body.
 * @param onActivity - transport-activity callback for the idle watchdog.
 * @param binding - what the request is bound to, recorded with its thinking.
 * @returns the chunk stream; throws when the stream ends before `message_stop`.
 */
export async function* streamAnthropic(stream, onActivity, binding) {
    const translator = new AnthropicStreamTranslator(binding);
    for await (const sseEvent of parseSse(stream, onActivity)) {
        let event;
        try {
            event = JSON.parse(sseEvent.data);
        }
        catch {
            throw new LlmError(`malformed SSE payload: ${sseEvent.data.slice(0, 120)}`, 'MALFORMED_RESPONSE');
        }
        yield* translator.push(event);
        if (translator.terminated)
            return;
    }
    throw new LlmError('Anthropic SSE stream ended before message_stop', 'STREAM_CLOSED');
}
