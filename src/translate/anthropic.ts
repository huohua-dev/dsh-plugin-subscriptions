/**
 * Translate between the harness message vocabulary and the Anthropic Messages
 * API wire format used by the claude provider: request message assembly, tool
 * schema mapping, and a push-model SSE-event → StreamChunk state machine
 * ({@link AnthropicStreamTranslator}) so tests need no streams.
 */

import { createHash } from 'node:crypto'
import {
  CONTEXT_WINDOW_EXCEEDED_CODE,
  EMPTY_RESPONSE_CODE,
  LlmError,
  QUOTA_EXCEEDED_CODE,
} from '@deepseek-ai/dsh-llm'
import { ToolCallId } from '../compat.js'
import { isSubscriptionQuotaExceeded } from '../providers/quota.js'
import type {
  ContentBlock,
  ReplayEnvelope,
  StreamChunk,
  TokenUsage,
  ToolSchema,
} from '@deepseek-ai/dsh-llm'
import { parseSse } from './sse.js'
import type { ResolvedToolResultBlock, TranslatableMessage } from './resolved.js'

/**
 * The Claude Code identity block. The subscription endpoint rejects requests
 * that do not present as Claude Code, so this block is REQUIRED as the first
 * system entry on every request.
 */
export const CLAUDE_CODE_IDENTITY = 'You are Claude Code, Anthropic\'s official CLI for Claude.'

/** Tags wrapping a mid-conversation system message where it sits in the history. */
export const SYSTEM_REMINDER_OPEN = '<system-reminder>'
export const SYSTEM_REMINDER_CLOSE = '</system-reminder>'

/**
 * How far apart consecutive message breakpoints sit, in content blocks.
 *
 * A breakpoint looks back at most 20 blocks for an entry an earlier request
 * wrote, so marks must stay closer than that: one agentic turn can append a
 * dozen tool_use/tool_result blocks at once, and a single trailing mark would
 * silently fall out of range and rebuild the whole prefix.
 */
export const CACHE_BLOCK_STRIDE = 15

/**
 * Message breakpoints per request. Anthropic allows four in total: the last
 * `system` block and the last tool hold the tools+system prefix, so the
 * history gets the rest — enough to tolerate a turn appending roughly {@link
 * CACHE_BLOCK_STRIDE} × 2 blocks before a read is lost.
 */
export const MESSAGE_CACHE_BREAKPOINTS = 3

/** The 1h anchor Claude Code pins the tools+system prefix with. */
export const CACHE_CONTROL_1H = { type: 'ephemeral', ttl: '1h' } as const

/**
 * The user turn appended when translation would otherwise leave the body
 * ending on an assistant turn. Newer models reject assistant prefill, and the
 * harness can lose its trailing turn here (an unresolved image block is
 * skipped), leaving the previous assistant reply as the body's last word.
 */
export const TRAILING_USER_PLACEHOLDER = 'Continue.'

/** One Anthropic request message. */
export interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: Record<string, unknown>[]
}

/**
 * Tool result text for a `tool_use` the history never answered (an
 * interrupted or compacted turn). Anthropic rejects a call without a result,
 * so one is supplied; the model must not assume the call ran or did not.
 */
export const CLAUDE_UNKNOWN_TOOL_OUTCOME = 'The tool call has no recorded result. Its outcome is unknown; verify external state before retrying any operation that may have side effects.'

/** Response-level replay marker this translator stamps on every Claude finish. */
interface ClaudeReplayResponse {
  kind: 'claude'
  version: 1
}

/**
 * Per-block replay metadata, aligned with the emitted harness blocks.
 * `thinking` carries the signature Anthropic issued for a reasoning block
 * plus a digest of its text, so a history rewrite that shifted blocks cannot
 * pin a signature to the wrong reasoning. `redactedBefore` carries
 * `redacted_thinking` payloads that preceded the block on the wire (they have
 * no harness block of their own).
 */
export interface ClaudeBlockReplay {
  thinking?: { signature: string; digest: string }
  redactedBefore?: string[]
}

/** Which historical assistant messages may replay their thinking: same route, same model. */
export interface ClaudeReplayScope {
  provider: string
  model: string
}

/** Short digest binding a thinking signature to the reasoning text it signed. */
function thinkingDigest(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/** Block types Anthropic refuses `cache_control` on. */
function isThinkingBlock(block: Record<string, unknown>): boolean {
  return block.type === 'thinking' || block.type === 'redacted_thinking'
}

/**
 * Replay entries for one assistant message, or none when it was produced by
 * another route/model (signatures only verify on the model that issued them)
 * or carries no Claude envelope.
 */
function claudeReplayBlocks(message: TranslatableMessage, scope: ClaudeReplayScope | undefined): readonly ClaudeBlockReplay[] {
  if (scope === undefined || message.role !== 'assistant') return []
  const source = message.source as { kind?: string; provider?: string; model?: string; replayState?: unknown } | undefined
  if (source?.kind !== 'model' || source.provider !== scope.provider || source.model !== scope.model) return []
  const envelope = source.replayState
  if (typeof envelope !== 'object' || envelope === null) return []
  const { response, blocks } = envelope as { response?: unknown; blocks?: unknown }
  const marker = response as Partial<ClaudeReplayResponse> | null | undefined
  if (marker?.kind !== 'claude' || marker.version !== 1 || !Array.isArray(blocks)) return []
  return blocks.map((raw): ClaudeBlockReplay => {
    if (typeof raw !== 'object' || raw === null) return {}
    const entry = raw as Record<string, unknown>
    const thinking = entry.thinking as Record<string, unknown> | undefined
    const redacted = Array.isArray(entry.redactedBefore)
      ? entry.redactedBefore.filter((data): data is string => typeof data === 'string' && data.length > 0)
      : []
    return {
      ...typeof thinking?.signature === 'string' && thinking.signature.length > 0 && typeof thinking.digest === 'string'
        ? { thinking: { signature: thinking.signature, digest: thinking.digest } }
        : {},
      ...redacted.length > 0 ? { redactedBefore: redacted } : {},
    }
  })
}

/** Preserve native image blocks, retaining the existing text-only wire shape. */
function toolResultContent(block: ResolvedToolResultBlock): string | Record<string, unknown>[] {
  if (!block.content.some(part => part.type === 'image' && 'dataBase64' in part)) {
    return block.content.map(part => (part.type === 'text' ? part.text : '')).join('')
  }
  const content: Record<string, unknown>[] = []
  for (const part of block.content) {
    if (part.type === 'text' && part.text.length > 0) content.push({ type: 'text', text: part.text })
    if (part.type === 'image' && 'dataBase64' in part) {
      content.push({ type: 'image', source: { type: 'base64', media_type: part.mediaType, data: part.dataBase64 } })
    }
  }
  return content
}

/** Parse a tool call's raw JSON arguments into Anthropic's object-shaped `input`. */
function parseToolInput(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    // The model produced malformed JSON; an empty object keeps the request valid.
    return {}
  }
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
function leadWithToolResults(message: AnthropicMessage): void {
  const firstOther = message.content.findIndex(block => block.type !== 'tool_result')
  if (firstOther === -1) return
  if (!message.content.slice(firstOther).some(block => block.type === 'tool_result')) return
  message.content = [
    ...message.content.filter(block => block.type === 'tool_result'),
    ...message.content.filter(block => block.type !== 'tool_result'),
  ]
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
function conversationStart(messages: readonly TranslatableMessage[]): number {
  const index = messages.findIndex(message => message.role !== 'system')
  return index === -1 ? messages.length : index
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
export function toAnthropicMessages(messages: readonly TranslatableMessage[], replay?: ClaudeReplayScope): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  const start = conversationStart(messages)
  for (const [index, message] of messages.entries()) {
    // A leading system message is an opening instruction; toAnthropicSystem
    // owns those. A later one rides here so the cached prefix ahead of it
    // stays byte-identical.
    if (message.role === 'system' && index < start) continue
    const role = message.role === 'assistant' ? 'assistant' : 'user'
    const blocks: Record<string, unknown>[] = []
    if (message.role === 'tool') {
      const id = message.toolCallId ?? message.tool_call_id
        ?? (message.source?.kind === 'tool' ? String(message.source.callId) : undefined)
      if (id === undefined) throw new LlmError('tool result has no call id', 'INVALID_REQUEST')
      blocks.push({
        type: 'tool_result',
        tool_use_id: id,
        content: toolResultContent({ type: 'tool-result', toolCallId: ToolCallId(id), content: message.content }),
        ...message.isError === true ? { is_error: true } : {},
      })
      const last = out[out.length - 1]
      if (last?.role === 'user') last.content.push(...blocks)
      else out.push({ role: 'user', content: blocks })
      continue
    }
    const metadata = claudeReplayBlocks(message, replay)
    // Entries are aligned with the stored blocks; a rewritten message whose
    // block count moved can no longer be trusted to pair them.
    const aligned = metadata.length === message.content.length ? metadata : []
    for (const [position, block] of message.content.entries()) {
      for (const data of aligned[position]?.redactedBefore ?? []) {
        blocks.push({ type: 'redacted_thinking', data })
      }
      switch (block.type) {
        case 'text':
          // Anthropic rejects text blocks without non-whitespace text.
          if (block.text.trim().length === 0) break
          blocks.push({
            type: 'text',
            text: message.role === 'system'
              ? `${SYSTEM_REMINDER_OPEN}${block.text}${SYSTEM_REMINDER_CLOSE}`
              : block.text,
          })
          break
        case 'tool-call':
          // Anthropic accepts `tool_use` only in assistant messages, and only
          // when a matching `tool_result` follows. A tool call in any other
          // role is replayed narrative — a settled subagent's closing message
          // spliced into the parent as a user-role notice carries the calls it
          // died holding, which no result will ever answer — so it rides as
          // descriptive text instead of a call the API would reject.
          blocks.push(role === 'assistant'
            ? {
                type: 'tool_use',
                id: String(block.id),
                name: block.name,
                input: parseToolInput(block.arguments),
              }
            : { type: 'text', text: `[tool call ${block.name}: ${block.arguments}]` })
          break
        case 'tool-result':
          blocks.push({
            type: 'tool_result',
            tool_use_id: String(block.toolCallId),
            content: toolResultContent(block),
            ...block.isError === true ? { is_error: true } : {},
          })
          break
        case 'image':
          if ('dataBase64' in block) {
            blocks.push({
              type: 'image',
              source: { type: 'base64', media_type: block.mediaType, data: block.dataBase64 },
            })
          }
          // An unresolved ImageBlock carries only an attachment reference; the
          // adapter resolves images before translation, so this is skipped.
          break
        case 'reasoning': {
          const signed = aligned[position]?.thinking
          if (role === 'assistant' && signed !== undefined && signed.digest === thinkingDigest(block.text)) {
            blocks.push({ type: 'thinking', thinking: block.text, signature: signed.signature })
          }
          // Unsigned reasoning (another provider's, or a rewritten one) cannot
          // be verified by Anthropic and is not replayed.
          break
        }
        default:
          // unknown blocks.
          break
      }
    }
    if (blocks.length === 0) continue
    const last = out[out.length - 1]
    if (last !== undefined && last.role === role) last.content.push(...blocks)
    else out.push({ role, content: blocks })
  }
  for (const message of out) {
    if (message.role === 'user') leadWithToolResults(message)
  }
  return out
}

/** Plain text of a `tool_result`'s content, for riding an orphan result as text. */
function toolResultText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return (content as Record<string, unknown>[])
    .map(part => (part.type === 'text' && typeof part.text === 'string' ? part.text : ''))
    .join('')
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
export function reconcileAnthropicToolPairs(messages: readonly AnthropicMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = []
  for (const [index, message] of messages.entries()) {
    if (message.role === 'assistant') {
      out.push(message)
      const calls = [...new Set(message.content
        .filter(block => block.type === 'tool_use')
        .map(block => String(block.id)))]
      if (calls.length === 0) continue
      const next = messages[index + 1]
      const answered = new Set(next?.role === 'user'
        ? next.content.filter(block => block.type === 'tool_result').map(block => String(block.tool_use_id))
        : [])
      // A next user turn is answered (or repaired) in its own pass below.
      if (next?.role === 'user') continue
      const missing = calls.filter(id => !answered.has(id))
      if (missing.length > 0) {
        out.push({ role: 'user', content: missing.map(id => unknownToolOutcome(id)) })
      }
      continue
    }
    const previous = out[out.length - 1]
    const calls = previous?.role === 'assistant'
      ? [...new Set(previous.content.filter(block => block.type === 'tool_use').map(block => String(block.id)))]
      : []
    const callSet = new Set(calls)
    const seen = new Set<string>()
    let changed = false
    const content = message.content.map((block) => {
      if (block.type !== 'tool_result') return block
      const id = String(block.tool_use_id)
      if (callSet.has(id) && !seen.has(id)) {
        seen.add(id)
        return block
      }
      changed = true
      const text = toolResultText(block.content)
      return { type: 'text', text: `[tool result ${id}: ${text.length > 0 ? text : '(empty)'}]` }
    })
    const missing = calls.filter(id => !seen.has(id))
    if (!changed && missing.length === 0) {
      out.push(message)
      continue
    }
    const repaired: AnthropicMessage = { role: 'user', content: [...missing.map(id => unknownToolOutcome(id)), ...content] }
    leadWithToolResults(repaired)
    out.push(repaired)
  }
  return out
}

/** The error `tool_result` standing in for a call the history never answered. */
function unknownToolOutcome(id: string): Record<string, unknown> {
  return { type: 'tool_result', tool_use_id: id, content: CLAUDE_UNKNOWN_TOOL_OUTCOME, is_error: true }
}

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
export function markMessageCache(messages: readonly AnthropicMessage[], marks = MESSAGE_CACHE_BREAKPOINTS): void {
  // Replayed thinking blocks refuse cache_control; the marks skip over them.
  const blocks = messages.flatMap(message => message.content).filter(block => !isThinkingBlock(block))
  for (let mark = 0; mark < marks; mark++) {
    const at = blocks.length - 1 - mark * CACHE_BLOCK_STRIDE
    if (at < 0) return
    blocks[at].cache_control = { type: 'ephemeral' }
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
export function toAnthropicSystem(system?: string, messages?: readonly TranslatableMessage[]): Record<string, unknown>[] {
  const blocks: Record<string, unknown>[] = [{ type: 'text', text: CLAUDE_CODE_IDENTITY }]
  if (system !== undefined && system.length > 0) blocks.push({ type: 'text', text: system })
  const history = messages ?? []
  for (const message of history.slice(0, conversationStart(history))) {
    for (const block of message.content) {
      if (block.type === 'text') blocks.push({ type: 'text', text: block.text })
    }
  }
  // `tools` renders ahead of `system`, so this one marker caches both. It is
  // deliberately separate from the message marks: a tool_choice or thinking
  // change invalidates the messages tier only, and this entry survives it.
  // The 1h TTL is what Claude Code pins the tools+system prefix with; the
  // conversation marks stay on the 5m default.
  blocks[blocks.length - 1].cache_control = { ...CACHE_CONTROL_1H }
  return blocks
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
export function toAnthropicTools(tools: readonly ToolSchema[]): Record<string, unknown>[] {
  const sorted: Record<string, unknown>[] = [...tools]
    .sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0))
    .map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    }))
  if (sorted.length > 0) sorted[sorted.length - 1].cache_control = { ...CACHE_CONTROL_1H }
  return sorted
}

/** The subset of Anthropic SSE event shapes this translator reads. */
export interface AnthropicStreamEvent {
  type: string
  index?: number
  message?: {
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
  content_block?: {
    type?: string
    id?: string
    name?: string
    /** Initial thinking text / signature of a `thinking` block (usually empty). */
    thinking?: string
    signature?: string
    /** Encrypted payload of a `redacted_thinking` block. */
    data?: string
  }
  delta?: {
    type?: string
    text?: string
    thinking?: string
    signature?: string
    partial_json?: string
    stop_reason?: string
    /** Anthropic's explanation accompanying a `refusal` stop. */
    stop_details?: { explanation?: string }
  }
  usage?: { output_tokens?: number }
  error?: { type?: string; message?: string }
}

/** One open harness block under assembly. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  callId: string
  name?: string
  /** Accumulated thinking signature (reasoning blocks only). */
  signature?: string
  /** `redacted_thinking` payloads streamed just before this block. */
  redactedBefore?: string[]
}

/** Assemble the final ContentBlock for one open block. */
function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case 'text':
      return { type: 'text', text: block.text }
    case 'reasoning':
      return { type: 'reasoning', text: block.text }
    case 'tool-call':
      return {
        type: 'tool-call',
        id: ToolCallId(block.callId),
        name: block.name ?? '',
        arguments: block.text,
      }
  }
}

/**
 * Classify an Anthropic `error` event into a thrown LlmError.
 * @param error - the wire error object.
 * @returns the mapped error.
 */
export function anthropicFailure(error: { type?: string; message?: string } | undefined): LlmError {
  const type = error?.type ?? 'unknown_error'
  const message = error?.message ?? `Anthropic reported ${type}`
  switch (type) {
    case 'invalid_request_error':
      if (/prompt is too long/i.test(message)) return new LlmError(message, CONTEXT_WINDOW_EXCEEDED_CODE)
      // The request itself is at fault: resending it verbatim fails the same
      // way, so it must stay outside the retryable SERVER code.
      return new LlmError(message, 'INVALID_REQUEST')
    case 'not_found_error':
    case 'request_too_large':
      return new LlmError(message, 'INVALID_REQUEST')
    case 'rate_limit_error':
      return isSubscriptionQuotaExceeded(message)
        ? new LlmError(`Subscription quota exhausted: ${message}`, QUOTA_EXCEEDED_CODE)
        : new LlmError(message, 'RATE_LIMIT')
    case 'authentication_error':
    case 'permission_error':
      return new LlmError(message, 'AUTH')
    case 'billing_error':
      return new LlmError(message, QUOTA_EXCEEDED_CODE)
    default:
      // overloaded_error, api_error, and unknown types are transient.
      return new LlmError(message, 'SERVER')
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
  private blocks = new Map<number, OpenBlock>()
  private nextIndex = 0
  private sawAnyBlock = false
  private pendingUsage: { inputTokens: number; cacheReadTokens?: number; cacheWriteTokens?: number } | undefined
  private outputTokens: number | undefined
  private stopReason: 'stop' | 'tool-calls' | 'max-tokens' | 'refusal' = 'stop'
  private refusalExplanation: string | undefined
  private usageEmitted = false
  /** Replay entries by harness block index. */
  private replay: ClaudeBlockReplay[] = []
  /** `redacted_thinking` payloads waiting for the next harness block. */
  private pendingRedacted: string[] = []
  /** Set once `message_stop` produced the terminal finish chunk. */
  terminated = false

  private open(wireIndex: number, kind: OpenBlock['kind'], chunks: StreamChunk[], callId = '', name?: string): OpenBlock {
    const block: OpenBlock = {
      index: this.nextIndex++,
      kind,
      text: '',
      callId,
      ...name === undefined ? {} : { name },
      ...this.pendingRedacted.length === 0 ? {} : { redactedBefore: this.pendingRedacted },
    }
    this.pendingRedacted = []
    this.blocks.set(wireIndex, block)
    this.sawAnyBlock = true
    chunks.push({ type: 'block-start', index: block.index, blockType: kind })
    return block
  }

  /** Close one block: record its replay entry and emit its `block-end`. */
  private close(wireIndex: number, block: OpenBlock, chunks: StreamChunk[]): void {
    this.blocks.delete(wireIndex)
    const signature = block.kind === 'reasoning' && block.signature !== undefined && block.signature.length > 0
      ? block.signature
      : undefined
    this.replay[block.index] = {
      ...signature === undefined ? {} : { thinking: { signature, digest: thinkingDigest(block.text) } },
      ...block.redactedBefore === undefined ? {} : { redactedBefore: block.redactedBefore },
    }
    chunks.push({ type: 'block-end', index: block.index, block: closeBlock(block) })
  }

  /**
   * The replay envelope for a successful finish, one entry per emitted block;
   * undefined when the response carried no signed or redacted thinking, so
   * plain responses do not grow the session log.
   */
  private replayState(): ReplayEnvelope | undefined {
    const blocks: ClaudeBlockReplay[] = []
    for (let index = 0; index < this.nextIndex; index++) blocks.push(this.replay[index] ?? {})
    if (!blocks.some(entry => entry.thinking !== undefined || entry.redactedBefore !== undefined)) return undefined
    return { response: { kind: 'claude', version: 1 } satisfies ClaudeReplayResponse, blocks }
  }

  private emitUsage(chunks: StreamChunk[]): void {
    if (this.usageEmitted) return
    this.usageEmitted = true
    const usage: TokenUsage = {
      inputTokens: this.pendingUsage?.inputTokens ?? 0,
      outputTokens: this.outputTokens ?? 0,
      ...this.pendingUsage?.cacheReadTokens !== undefined
        ? { cacheReadTokens: this.pendingUsage.cacheReadTokens }
        : {},
      ...this.pendingUsage?.cacheWriteTokens !== undefined
        ? { cacheWriteTokens: this.pendingUsage.cacheWriteTokens }
        : {},
    }
    chunks.push({ type: 'usage', usage })
  }

  /**
   * Process one parsed Anthropic SSE event.
   * @param event - the parsed event object.
   * @returns the StreamChunks this event produced (possibly none).
   */
  push(event: AnthropicStreamEvent): StreamChunk[] {
    if (this.terminated) return []
    const chunks: StreamChunk[] = []
    switch (event.type) {
      case 'message_start': {
        const usage = event.message?.usage
        if (usage !== undefined) {
          this.pendingUsage = {
            inputTokens: usage.input_tokens ?? 0,
            ...usage.cache_read_input_tokens !== undefined
              ? { cacheReadTokens: usage.cache_read_input_tokens }
              : {},
            ...usage.cache_creation_input_tokens !== undefined
              ? { cacheWriteTokens: usage.cache_creation_input_tokens }
              : {},
          }
          this.outputTokens = usage.output_tokens ?? this.outputTokens
        }
        return chunks
      }
      case 'content_block_start': {
        const wireIndex = event.index ?? 0
        const block = event.content_block
        switch (block?.type) {
          case 'text':
            this.open(wireIndex, 'text', chunks)
            break
          case 'thinking': {
            const opened = this.open(wireIndex, 'reasoning', chunks)
            if (typeof block.signature === 'string' && block.signature.length > 0) opened.signature = block.signature
            if (typeof block.thinking === 'string' && block.thinking.length > 0) {
              opened.text += block.thinking
              chunks.push({ type: 'reasoning-delta', index: opened.index, text: block.thinking })
            }
            break
          }
          case 'redacted_thinking':
            // No harness content; replayed ahead of the block that follows it.
            if (typeof block.data === 'string' && block.data.length > 0) this.pendingRedacted.push(block.data)
            break
          case 'tool_use': {
            const opened = this.open(wireIndex, 'tool-call', chunks, block.id ?? '', block.name)
            chunks.push({
              type: 'tool-call-delta',
              index: opened.index,
              id: ToolCallId(opened.callId),
              ...block.name === undefined ? {} : { name: block.name },
              argumentsDelta: '',
            })
            break
          }
          default:
            break
        }
        return chunks
      }
      case 'content_block_delta': {
        const wireIndex = event.index ?? 0
        const block = this.blocks.get(wireIndex)
        const delta = event.delta
        if (block === undefined || delta === undefined) return chunks
        switch (delta.type) {
          case 'text_delta':
            block.text += delta.text ?? ''
            chunks.push({ type: 'text-delta', index: block.index, text: delta.text ?? '' })
            break
          case 'thinking_delta':
            block.text += delta.thinking ?? ''
            chunks.push({ type: 'reasoning-delta', index: block.index, text: delta.thinking ?? '' })
            break
          case 'input_json_delta':
            block.text += delta.partial_json ?? ''
            chunks.push({
              type: 'tool-call-delta',
              index: block.index,
              id: ToolCallId(block.callId),
              ...block.name === undefined ? {} : { name: block.name },
              argumentsDelta: delta.partial_json ?? '',
            })
            break
          case 'signature_delta':
            // No harness content; kept for replaying the signed thinking.
            if (block.kind === 'reasoning') block.signature = (block.signature ?? '') + (delta.signature ?? '')
            break
          default:
            // future deltas carry no harness content.
            break
        }
        return chunks
      }
      case 'content_block_stop': {
        const wireIndex = event.index ?? 0
        const block = this.blocks.get(wireIndex)
        if (block === undefined) return chunks
        this.close(wireIndex, block, chunks)
        return chunks
      }
      case 'message_delta': {
        if (event.usage?.output_tokens !== undefined) this.outputTokens = event.usage.output_tokens
        switch (event.delta?.stop_reason) {
          case 'end_turn':
          case 'stop_sequence':
            this.stopReason = 'stop'
            break
          case 'tool_use':
            this.stopReason = 'tool-calls'
            break
          case 'max_tokens':
          // Output ran into the model's context window: truncated like max_tokens.
          case 'model_context_window_exceeded':
            this.stopReason = 'max-tokens'
            break
          case 'refusal':
            this.stopReason = 'refusal'
            this.refusalExplanation = event.delta?.stop_details?.explanation
            break
          default:
            break
        }
        return chunks
      }
      case 'message_stop': {
        this.terminated = true
        for (const [wireIndex, block] of [...this.blocks]) this.close(wireIndex, block, chunks)
        this.emitUsage(chunks)
        if (this.stopReason === 'refusal') {
          // The safety classifier stopped the turn; retrying it verbatim
          // refuses again, so it fails with Anthropic's own explanation.
          const explanation = this.refusalExplanation?.trim()
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
          })
        } else if (this.stopReason === 'stop' && !this.sawAnyBlock) {
          chunks.push({
            type: 'finish',
            reason: {
              kind: 'error',
              failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
            },
          })
        } else {
          const replayState = this.replayState()
          chunks.push({
            type: 'finish',
            reason: { kind: this.stopReason },
            ...replayState === undefined ? {} : { replayState },
          })
        }
        return chunks
      }
      case 'error':
        throw anthropicFailure(event.error)
      default:
        // ping and future event types carry no harness content.
        return chunks
    }
  }
}

/**
 * Consume an Anthropic SSE byte stream and yield harness StreamChunks.
 * @param stream - raw response body.
 * @param onActivity - transport-activity callback for the idle watchdog.
 * @returns the chunk stream; throws when the stream ends before `message_stop`.
 */
export async function* streamAnthropic(
  stream: ReadableStream<Uint8Array>,
  onActivity?: () => void,
): AsyncGenerator<StreamChunk> {
  const translator = new AnthropicStreamTranslator()
  for await (const sseEvent of parseSse(stream, onActivity)) {
    let event: AnthropicStreamEvent
    try {
      event = JSON.parse(sseEvent.data) as AnthropicStreamEvent
    } catch {
      throw new LlmError(`malformed SSE payload: ${sseEvent.data.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }
    yield* translator.push(event)
    if (translator.terminated) return
  }
  throw new LlmError('Anthropic SSE stream ended before message_stop', 'STREAM_CLOSED')
}
