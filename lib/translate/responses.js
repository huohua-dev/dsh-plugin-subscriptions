/**
 * Translate between the harness message vocabulary and the OpenAI Responses
 * API wire format shared by the codex and grok providers: request input
 * assembly, tool schema mapping, and a push-model SSE-event → StreamChunk
 * state machine ({@link ResponsesStreamTranslator}) so tests need no streams.
 */
import { CONTEXT_WINDOW_EXCEEDED_CODE, EMPTY_RESPONSE_CODE, isContextWindowExceededError, isQuotaExceededError, LlmError, QUOTA_EXCEEDED_CODE, } from '@deepseek-ai/dsh-llm';
import { createHash } from 'node:crypto';
import { ToolCallId } from '../compat.js';
import { parseSse } from './sse.js';
import { withToolResultImages } from './resolved.js';
/** Longest `call_id` the OpenAI Responses schema (and Meta's Muse gateway) accepts. */
export const RESPONSES_CALL_ID_MAX_LENGTH = 64;
const RESPONSES_CALL_ID_PREFIX = 'call_';
/**
 * Bound tool-call ids at a provider's wire boundary. Opt-in per adapter (Codex,
 * Muse) rather than inside {@link toResponsesInput}, so routes that accept
 * long ids (Grok) keep theirs verbatim. Short ids stay verbatim. Oversized
 * ids — typically another route's history after a model switch, e.g. the
 * composite `call_…|fc_…` ids OpenAI-compatible routers mint — become
 * deterministic hashes, and every id already present in this request is
 * reserved first so a generated id cannot collide with a legitimate short
 * one (or another oversized id). Deterministic mapping keeps each
 * function_call paired with its output and the request prefix cache-stable.
 * @param input - Responses input items.
 * @returns input whose function_call / function_call_output ids fit the limit.
 */
export function boundResponsesCallIds(input) {
    const mapping = new Map();
    const used = new Set();
    const callId = (item) => (item.type === 'function_call' || item.type === 'function_call_output') && typeof item.call_id === 'string'
        ? item.call_id
        : undefined;
    for (const item of input) {
        const id = callId(item);
        if (id !== undefined && id.length <= RESPONSES_CALL_ID_MAX_LENGTH) {
            mapping.set(id, id);
            used.add(id);
        }
    }
    for (const item of input) {
        const id = callId(item);
        if (id === undefined || mapping.has(id))
            continue;
        let attempt = 0;
        let normalized;
        do {
            const hash = createHash('sha256');
            if (attempt > 0)
                hash.update(String(attempt)).update('\0');
            const digest = hash.update(id).digest('hex');
            normalized = `${RESPONSES_CALL_ID_PREFIX}${digest.slice(0, RESPONSES_CALL_ID_MAX_LENGTH - RESPONSES_CALL_ID_PREFIX.length)}`;
            attempt += 1;
        } while (used.has(normalized));
        mapping.set(id, normalized);
        used.add(normalized);
    }
    return input.map((item) => {
        const id = callId(item);
        if (id === undefined)
            return item;
        const normalized = mapping.get(id) ?? id;
        return normalized === id ? item : { ...item, call_id: normalized };
    });
}
/** Flatten a tool result's content to plain text for `function_call_output`. */
function toolResultText(block) {
    return block.content.map(part => (part.type === 'text' ? part.text : '')).join('');
}
/**
 * Convert harness messages into Responses `instructions` + `input` items.
 * System-role messages become `instructions`; an explicit `system` argument
 * wins over them when both exist. Reasoning blocks are never replayed in
 * their text form: a Responses model continuing past a tool call needs its
 * reasoning back as the provider's completed reasoning items (id, summary,
 * and the ENCRYPTED payload), so `reasoningFor` may resolve per-call
 * captured items, replayed ahead of the matching function_call item. Images
 * must arrive pre-resolved
 * ({@link TranslatableMessage}); an unresolved ImageBlock is skipped because
 * its bytes are unreachable here.
 * @param messages - ordered conversation messages with resolved images.
 * @param system - explicit system prompt, which takes precedence.
 * @param reasoningFor - resolves one tool call id to the COMPLETED reasoning
 *   items captured for it (id, summary, status, encrypted payload), replayed
 *   ahead of the matching function_call item, when the adapter kept them.
 * @returns request fields ready to merge into the request body.
 */
export function toResponsesInput(messages, system, reasoningFor) {
    const input = [];
    const systemTexts = [];
    // [2026-08-23]-[reasoning models lose their chain of thought across a tool
    // round trip unless the completed reasoning items ride back in; dedupe by
    // ARRAY REFERENCE so parallel calls of one response (which share one array
    // instance) replay the items once, before the first of them]
    let lastReplay;
    for (const message of withToolResultImages(messages)) {
        if (message.role === 'system') {
            for (const block of message.content) {
                if (block.type === 'text')
                    systemTexts.push(block.text);
            }
            continue;
        }
        // Current harness tool results are first-class role=tool messages.
        // Responses represents their text as function_call_output items.
        if (message.role === 'tool') {
            const callId = message.toolCallId ?? message.tool_call_id
                ?? (message.source?.kind === 'tool' ? String(message.source.callId) : undefined);
            if (callId === undefined)
                throw new LlmError('tool result has no call id', 'INVALID_REQUEST');
            input.push({
                type: 'function_call_output',
                call_id: callId,
                output: message.content.map(block => block.type === 'text' ? block.text : '').join(''),
            });
            continue;
        }
        const role = message.role;
        let content = [];
        const flushMessage = () => {
            if (content.length === 0)
                return;
            input.push({ type: 'message', role, content });
            content = [];
        };
        for (const block of message.content) {
            switch (block.type) {
                case 'text':
                    content.push({ type: role === 'assistant' ? 'output_text' : 'input_text', text: block.text });
                    break;
                case 'tool-call': {
                    flushMessage();
                    const encrypted = reasoningFor?.(String(block.id));
                    if (encrypted !== undefined && encrypted !== lastReplay) {
                        for (const item of encrypted) {
                            input.push({
                                type: 'reasoning',
                                ...item.id === undefined ? {} : { id: item.id },
                                ...item.summary === undefined ? {} : { summary: item.summary },
                                ...item.status === undefined ? {} : { status: item.status },
                                encrypted_content: item.encrypted_content,
                            });
                        }
                        lastReplay = encrypted;
                    }
                    input.push({
                        type: 'function_call',
                        call_id: String(block.id),
                        name: block.name,
                        arguments: block.arguments,
                    });
                    break;
                }
                case 'tool-result':
                    flushMessage();
                    input.push({
                        type: 'function_call_output',
                        call_id: String(block.toolCallId),
                        output: toolResultText(block),
                    });
                    break;
                case 'image':
                    if ('dataBase64' in block) {
                        content.push({
                            type: 'input_image',
                            image_url: `data:${block.mediaType};base64,${block.dataBase64}`,
                        });
                    }
                    // An unresolved ImageBlock carries only an attachment reference; the
                    // adapter resolves images before translation, so this is skipped.
                    break;
                default:
                    // reasoning's text form is not replayed (encrypted replay rides
                    // reasoningFor), unknown blocks.
                    break;
            }
        }
        flushMessage();
    }
    const instructions = system ?? (systemTexts.length > 0 ? systemTexts.join('\n\n') : undefined);
    return { ...instructions === undefined ? {} : { instructions }, input };
}
/**
 * Map harness tool schemas to Responses function tools.
 *
 * OpenAI Responses may normalize schemas into strict mode when `strict` is
 * omitted. Codex and Copilot opt out to preserve harness optional parameters;
 * this does not prevent a model from voluntarily supplying optional fields.
 * Other providers keep their existing defaults unless explicitly opted out.
 * @param tools - tool schemas from the request.
 * @param options - provider-specific opt-out from strict schema normalization.
 * @returns Responses `tools` array entries.
 */
export function toResponsesTools(tools, options = {}) {
    return tools.map(tool => ({
        type: 'function',
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        ...options.strict === undefined ? {} : { strict: options.strict },
    }));
}
/**
 * Map Responses usage to disjoint harness counts (cached input is subtracted
 * out of `inputTokens` and reported as `cacheReadTokens`).
 * @param usage - wire usage from `response.completed`.
 * @returns harness token usage.
 */
export function mapResponsesUsage(usage) {
    const cached = usage.input_tokens_details?.cached_tokens;
    const reasoning = usage.output_tokens_details?.reasoning_tokens;
    return {
        inputTokens: usage.input_tokens - (cached ?? 0),
        outputTokens: usage.output_tokens,
        ...cached !== undefined ? { cacheReadTokens: cached } : {},
        ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
    };
}
/**
 * Read the provider's own backoff hint off a Responses error payload.
 *
 * Overload shedding arrives as
 * `{"error":{"code":"server_is_overloaded","headers":{"retry-after":"317","retry-after-ms":"317000"}}}`.
 * The retry plugin honours `providerRetryAfterMs` for every retryable code
 * (see `httpLlmError`), so surfacing it here replaces a blind exponential
 * backoff with the delay upstream actually asked for.
 * @param headers - the error payload's `headers` member, when present.
 * @returns the wait in ms, or undefined when the payload carried none.
 */
function retryAfterMsFromPayload(headers) {
    if (typeof headers !== 'object' || headers === null)
        return undefined;
    const record = headers;
    for (const [name, multiplier] of [['retry-after-ms', 1], ['retry-after', 1000]]) {
        const raw = record[name];
        if (typeof raw !== 'number' && typeof raw !== 'string')
            continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0)
            continue;
        const delay = Math.max(1, Math.round(value * multiplier));
        if (Number.isSafeInteger(delay) && delay <= 2_147_483_647)
            return delay;
    }
    return undefined;
}
/**
 * Classify a Responses failure payload into a thrown LlmError.
 * @param code - provider error code, when present.
 * @param message - provider error message, when present.
 * @param headers - the payload's `headers` member, carrying `retry-after`.
 * @returns the mapped error (context overflow, quota, otherwise SERVER).
 */
export function responsesFailure(code, message, headers) {
    const text = message ?? code ?? 'the provider reported a failed response';
    const detail = `${code ?? ''} ${message ?? ''}`;
    const retryAfterMs = retryAfterMsFromPayload(headers);
    const extra = retryAfterMs === undefined ? {} : { providerRetryAfterMs: retryAfterMs };
    if (code === 'context_window_exceeded' || isContextWindowExceededError(detail)) {
        return new LlmError(text, CONTEXT_WINDOW_EXCEEDED_CODE, extra);
    }
    if ((code !== undefined && /insufficient|quota/i.test(code)) || isQuotaExceededError(detail)) {
        return new LlmError(text, QUOTA_EXCEEDED_CODE, extra);
    }
    return new LlmError(text, 'SERVER', extra);
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
 * Push-model Responses SSE translator: feed each parsed event object to
 * {@link push} and collect the emitted harness StreamChunks. Block indexes
 * are allocated in first-seen order; `usage` is emitted before the terminal
 * `finish`, and nothing is emitted after it. Terminal provider failures
 * throw {@link LlmError}.
 */
export class ResponsesStreamTranslator {
    blocks = new Map();
    order = [];
    nextIndex = 0;
    sawToolCall = false;
    // Declarations are not executable calls until a tool-call block was assembled.
    declaredCalls = new Set();
    completedCallItems = new Set();
    /** Set once `response.completed` produced the terminal finish chunk. */
    terminated = false;
    open(key, kind, chunks, callId = '', name) {
        const block = {
            key,
            index: this.nextIndex++,
            kind,
            text: '',
            callId,
            ...name === undefined ? {} : { name },
        };
        this.blocks.set(key, block);
        this.order.push(block);
        chunks.push({ type: 'block-start', index: block.index, blockType: kind });
        return block;
    }
    textBlock(key, chunks) {
        return this.blocks.get(key) ?? this.open(key, 'text', chunks);
    }
    reasoningBlock(key, chunks) {
        return this.blocks.get(key) ?? this.open(key, 'reasoning', chunks);
    }
    close(key, chunks) {
        const block = this.blocks.get(key);
        if (block === undefined)
            return;
        this.blocks.delete(key);
        chunks.push({ type: 'block-end', index: block.index, block: closeBlock(block) });
    }
    /** Close every still-open block for one output item (prefix match on the key). */
    closeItem(itemId, chunks) {
        for (const key of [...this.blocks.keys()]) {
            if (key.startsWith(`${itemId}:`))
                this.close(key, chunks);
        }
    }
    /** Close every still-open block (provider ended the response without done events). */
    closeAll(chunks) {
        for (const block of this.order)
            this.closeKeyIfOpen(block, chunks);
    }
    closeKeyIfOpen(block, chunks) {
        for (const [key, candidate] of this.blocks) {
            if (candidate === block) {
                this.blocks.delete(key);
                chunks.push({ type: 'block-end', index: block.index, block: closeBlock(block) });
                return;
            }
        }
    }
    /**
     * Process one parsed Responses SSE event.
     * @param event - the parsed event object.
     * @returns the StreamChunks this event produced (possibly none).
     */
    push(event) {
        if (this.terminated)
            return [];
        const chunks = [];
        if ((event.type === 'response.output_item.added' || event.type === 'response.output_item.done')
            && event.item?.type === 'function_call') {
            this.declaredCalls.add(typeof event.item.call_id === 'string' ? event.item.call_id : '');
        }
        if (event.type === 'response.function_call_arguments.done') {
            this.completedCallItems.add(typeof event.item_id === 'string' ? `${event.item_id}:call` : '');
        }
        switch (event.type) {
            case 'response.output_item.added': {
                const item = event.item;
                if (item?.type === 'function_call' && item.id !== undefined) {
                    this.sawToolCall = true;
                    const callId = item.call_id ?? '';
                    const block = this.open(`${item.id}:call`, 'tool-call', chunks, callId, item.name);
                    chunks.push({
                        type: 'tool-call-delta',
                        index: block.index,
                        id: ToolCallId(callId),
                        ...item.name === undefined ? {} : { name: item.name },
                        argumentsDelta: '',
                    });
                }
                return chunks;
            }
            case 'response.output_text.delta': {
                const key = `${event.item_id ?? ''}:text:${String(event.content_index ?? 0)}`;
                const block = this.textBlock(key, chunks);
                block.text += event.delta ?? '';
                chunks.push({ type: 'text-delta', index: block.index, text: event.delta ?? '' });
                return chunks;
            }
            case 'response.reasoning_summary_text.delta':
            case 'response.reasoning_text.delta': {
                const sub = event.summary_index ?? event.content_index ?? 0;
                const key = `${event.item_id ?? ''}:reason:${String(sub)}`;
                const block = this.reasoningBlock(key, chunks);
                block.text += event.delta ?? '';
                chunks.push({ type: 'reasoning-delta', index: block.index, text: event.delta ?? '' });
                return chunks;
            }
            case 'response.function_call_arguments.delta': {
                const key = `${event.item_id ?? ''}:call`;
                let block = this.blocks.get(key);
                if (block === undefined) {
                    // The item.added event was missed; open the block from the delta alone.
                    this.sawToolCall = true;
                    block = this.open(key, 'tool-call', chunks);
                }
                block.text += event.delta ?? '';
                chunks.push({
                    type: 'tool-call-delta',
                    index: block.index,
                    id: ToolCallId(block.callId),
                    ...block.name === undefined ? {} : { name: block.name },
                    argumentsDelta: event.delta ?? '',
                });
                return chunks;
            }
            case 'response.output_item.done': {
                const item = event.item;
                if (item === undefined || item.id === undefined)
                    return chunks;
                if (item.type === 'function_call') {
                    const key = `${item.id}:call`;
                    // The provider may deliver the complete arguments only on done.
                    const block = this.blocks.get(key);
                    if (block !== undefined && block.text.length === 0 && item.arguments !== undefined) {
                        block.text = item.arguments;
                    }
                    this.close(key, chunks);
                }
                else if (item.type === 'message') {
                    if (![...this.blocks.keys()].some(key => key.startsWith(`${item.id}:text:`))) {
                        // No deltas arrived for this item; synthesize blocks from the done payload.
                        for (const [partIndex, part] of (item.content ?? []).entries()) {
                            // An explicit empty string is valid silent output, just like an empty delta.
                            if (part?.type !== 'output_text' || typeof part.text !== 'string')
                                continue;
                            const block = this.open(`${item.id}:text:${partIndex}`, 'text', chunks);
                            block.text = part.text;
                            this.close(`${item.id}:text:${partIndex}`, chunks);
                        }
                    }
                    this.closeItem(item.id, chunks);
                }
                else {
                    this.closeItem(item.id, chunks);
                }
                return chunks;
            }
            case 'response.completed': {
                // Do not let an empty text block hide a call that was declared but never
                // assembled. Compare call_id, not item.id: gateways may rewrite item IDs.
                for (const item of event.response?.output ?? []) {
                    if (item.type === 'function_call') {
                        this.declaredCalls.add(typeof item.call_id === 'string' ? item.call_id : '');
                    }
                }
                const callBlocks = this.order.filter(block => block.kind === 'tool-call');
                const representedCalls = new Set(callBlocks.map(block => block.callId));
                const representedItems = new Set(callBlocks.map(block => block.key));
                const missingCall = callBlocks.some(block => block.callId.length === 0 || !block.name)
                    || [...this.declaredCalls].some(id => id.length === 0 || !representedCalls.has(id))
                    || [...this.completedCallItems].some(key => key.length === 0 || !representedItems.has(key));
                this.terminated = true;
                this.closeAll(chunks);
                const usage = event.response?.usage;
                if (usage !== undefined)
                    chunks.push({ type: 'usage', usage: mapResponsesUsage(usage) });
                if (missingCall) {
                    chunks.push({
                        type: 'finish',
                        reason: {
                            kind: 'error',
                            failure: { message: 'completed response contains an unassembled function call', code: 'MALFORMED_RESPONSE' },
                        },
                    });
                }
                else if (this.order.length === 0) {
                    chunks.push({
                        type: 'finish',
                        reason: {
                            kind: 'error',
                            failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
                        },
                    });
                }
                else {
                    chunks.push({ type: 'finish', reason: { kind: this.sawToolCall ? 'tool-calls' : 'stop' } });
                }
                return chunks;
            }
            case 'response.failed':
                throw responsesFailure(event.response?.error?.code, event.response?.error?.message, event.response?.error?.headers);
            case 'response.incomplete':
                throw responsesFailure(event.response?.incomplete_details?.reason, event.response?.error?.message
                    ?? `the provider reported an incomplete response (${event.response?.incomplete_details?.reason ?? 'unknown reason'})`);
            case 'error':
                // The wire shape is `{"type":"error","error":{"code","message","headers"}}`.
                // Reading `event.code` / `event.message` here yielded undefined for both,
                // so every streamed upstream failure collapsed to the generic "the
                // provider reported a failed response" and lost its retry hint.
                throw responsesFailure(event.error?.code ?? event.code, event.error?.message ?? event.message, event.error?.headers);
            default:
                // response.created, response.in_progress, content_part events, etc.: no chunks.
                return chunks;
        }
    }
}
/**
 * Consume a Responses SSE byte stream and yield harness StreamChunks.
 * @param stream - raw response body.
 * @param onActivity - transport-activity callback for the idle watchdog.
 * @param transform - optional per-event rewrite applied before translation
 *   (Copilot's gateway mints a fresh item id per event; the adapter rewrites
 *   them into stable per-item keys).
 * @returns the chunk stream; throws when the stream ends before `response.completed`.
 */
export async function* streamResponses(stream, onActivity, transform) {
    const translator = new ResponsesStreamTranslator();
    for await (const sseEvent of parseSse(stream, onActivity)) {
        let event;
        try {
            event = JSON.parse(sseEvent.data);
        }
        catch {
            throw new LlmError(`malformed SSE payload: ${sseEvent.data.slice(0, 120)}`, 'MALFORMED_RESPONSE');
        }
        if (transform !== undefined)
            event = transform(event);
        yield* translator.push(event);
        if (translator.terminated)
            return;
    }
    throw new LlmError('Responses SSE stream ended before response.completed', 'STREAM_CLOSED');
}
