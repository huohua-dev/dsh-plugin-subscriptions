/**
 * Claude request parameters derived from the discovered catalog: the thinking
 * mode, the effort level fitted to the model's advertised levels, and the
 * output cap held under the model's ceiling — each a 400 on the wire when wrong.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import './keep-alive.js'
import { BlockAssembler, LlmError, MessageId, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import { CLAUDE_API_URL, CLAUDE_THINKING_BINDING_BETA, ClaudeAdapter, claudeEffort, claudeThinkingType } from '../src/providers/claude.js'
import { AccountTokenManager } from '../src/providers/accounts.js'
import type { DiscoveredModel, FetchFn } from '../src/providers/common.js'
import type { ClaudeSession } from '../src/auth/store.js'

const SUPPORTED = { supported: true }

/** Effort levels in the discovered-catalog shape. */
function efforts(...levels: string[]): DiscoveredModel['reasoning'] {
  return { efforts: levels.map(level => ({ id: ReasoningEffortId(level), name: level })) }
}

test('claudeThinkingType prefers adaptive wherever the model offers it', () => {
  // The 4.6 models accept both; manual budgets are deprecated there.
  assert.equal(claudeThinkingType({ thinking: { types: { enabled: SUPPORTED, adaptive: SUPPORTED } } }), 'adaptive')
  assert.equal(claudeThinkingType({ thinking: { types: { adaptive: SUPPORTED } } }), 'adaptive')
  // 4.5 and earlier are extended-only and reject adaptive.
  assert.equal(claudeThinkingType({ thinking: { types: { enabled: SUPPORTED, adaptive: { supported: false } } } }), 'enabled')
  assert.equal(claudeThinkingType({}), undefined)
  assert.equal(claudeThinkingType(undefined), undefined)
})

test('claudeEffort fits the requested level to the model\'s advertised levels', () => {
  const opus46 = efforts('low', 'medium', 'high', 'max')
  assert.equal(claudeEffort('high', opus46), 'high')
  assert.equal(claudeEffort('max', opus46), 'max')
  // xhigh is missing on the 4.6 models: the nearest level below it.
  assert.equal(claudeEffort('xhigh', opus46), 'high')
  // Nothing below the request: the lowest advertised level.
  assert.equal(claudeEffort('low', efforts('medium', 'high')), 'medium')
  // Outside the Claude scale, or no capability at all: not sent.
  assert.equal(claudeEffort('none', opus46), undefined)
  assert.equal(claudeEffort('high', undefined), undefined)
  assert.equal(claudeEffort(undefined, opus46), undefined)
})

const SESSION: ClaudeSession = {
  accessToken: 'sk-ant-oat01-token',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3_600_000,
  scopes: 'user:inference',
}

function memoryTokens(session: ClaudeSession): AccountTokenManager<ClaudeSession> {
  let stored = session
  return new AccountTokenManager<ClaudeSession>({
    provider: 'claude',
    displayName: 'Test',
    makeOptions: () => ({ preemptMs: 0, refresh: value => Promise.resolve(value), isPermanent: () => false }),
    io: {
      list: () => Promise.resolve([{ key: 'acct', session: stored }]),
      get: () => Promise.resolve(stored),
      save: (_account, value) => {
        stored = value
        return Promise.resolve()
      },
      remove: () => Promise.resolve(),
    },
  })
}

const MODELS = {
  data: [
    {
      id: 'claude-opus-4-6',
      display_name: 'Claude Opus 4.6',
      max_input_tokens: 1_000_000,
      max_tokens: 128_000,
      capabilities: {
        thinking: { types: { enabled: SUPPORTED, adaptive: SUPPORTED } },
        effort: { supported: true, low: SUPPORTED, medium: SUPPORTED, high: SUPPORTED, max: SUPPORTED },
      },
    },
    {
      id: 'claude-opus-4-5',
      display_name: 'Claude Opus 4.5',
      max_input_tokens: 200_000,
      max_tokens: 64_000,
      capabilities: {
        thinking: { types: { enabled: SUPPORTED, adaptive: { supported: false } } },
        effort: { supported: true, low: SUPPORTED, medium: SUPPORTED, high: SUPPORTED },
      },
    },
  ],
}

const STREAM = [
  { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } },
  { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
  { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
  { type: 'message_stop' },
].map(event => `data: ${JSON.stringify(event)}\n\n`).join('')

/** Serves the catalog on /v1/models and records each Messages request body. */
function routedFetch(): { fetchFn: FetchFn; bodies: Record<string, unknown>[] } {
  const bodies: Record<string, unknown>[] = []
  const fetchFn = ((url: string, init?: RequestInit) => {
    if (String(url).includes('/v1/models')) {
      return Promise.resolve(new Response(JSON.stringify(MODELS), { status: 200 }))
    }
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
    return Promise.resolve(new Response(STREAM, { status: 200, headers: { 'content-type': 'text/event-stream' } }))
  }) as FetchFn
  return { fetchFn, bodies }
}

async function send(model: string, extra: { reasoningEffort?: string; maxTokens?: number }): Promise<Record<string, unknown>> {
  const { fetchFn, bodies } = routedFetch()
  const adapter = new ClaudeAdapter({
    models: [],
    streamIdleTimeoutMs: 5_000,
    tokens: memoryTokens(SESSION),
    discovery: true,
    fetchFn,
    resolveCliVersion: () => Promise.resolve('2.1.999'),
  })
  const messages: Message[] = [{
    id: MessageId('u0'), role: 'user', content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' },
  }]
  for await (const _chunk of adapter.stream({
    provider: 'claude',
    model,
    messages,
    ...extra.reasoningEffort === undefined ? {} : { reasoningEffort: ReasoningEffortId(extra.reasoningEffort) },
    ...extra.maxTokens === undefined ? {} : { maxTokens: extra.maxTokens },
  })) { /* drain */ }
  assert.equal(bodies.length, 1)
  return bodies[0]
}

test('a dual-mode model is sent adaptive thinking, a fitted effort, and a capped output', async () => {
  const body = await send('claude-opus-4-6', { reasoningEffort: 'xhigh', maxTokens: 200_000 })
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized' })
  assert.deepEqual(body.output_config, { effort: 'high' })
  assert.equal(body.max_tokens, 128_000)
})

test('an extended-only model keeps a manual budget below its output cap', async () => {
  const body = await send('claude-opus-4-5', { reasoningEffort: 'max' })
  const thinking = body.thinking as { type: string; budget_tokens: number }
  assert.equal(thinking.type, 'enabled')
  assert.equal(body.max_tokens, 64_000)
  assert.ok(thinking.budget_tokens < 64_000)
  assert.deepEqual(body.output_config, { effort: 'high' })
})

const PREFIX_MODEL = 'claude-opus-5-5'
const userMessage = (id: string, text: string): Message => ({
  id: MessageId(id), role: 'user', content: [{ type: 'text', text }], source: { kind: 'user' },
})

function replayFixture() {
  const requests: { headers: Headers; body: { messages: { content: Record<string, unknown>[] }[]; thinking: unknown; system: { text: string }[] } }[] = []
  const replies: Response[] = []
  const adapter = new ClaudeAdapter({
    models: [],
    streamIdleTimeoutMs: 5_000,
    tokens: memoryTokens(SESSION),
    discovery: true,
    resolveCliVersion: async () => '2.1.999',
    fetchFn: async (url, init) => {
      if (String(url).includes('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ ...MODELS.data[0], id: PREFIX_MODEL }] }))
      }
      assert.equal(String(url), CLAUDE_API_URL)
      requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) })
      const reply = replies.shift()
      assert.ok(reply, 'no unexpected additional request')
      return reply
    },
  })
  const options = {
    provider: 'claude', model: PREFIX_MODEL, sessionId: 'fixed-session' as NonNullable<GenerateOptions['sessionId']>,
    messages: [userMessage('prompt', 'question')],
  } satisfies GenerateOptions
  const drain = async (messages: Message[]) => {
    const assembler = new BlockAssembler()
    for await (const chunk of adapter.stream({ ...options, messages })) assembler.push(chunk)
    return assembler
  }
  return { options, replies, requests, drain }
}

test('Claude wire binds signed replay and falls back only for an invalid replay signature', async () => {
  const { options, replies, requests, drain } = replayFixture()
  const signed = [
    { type: 'content_block_start', index: 1, content_block: { type: 'thinking', thinking: 'first thought', signature: 'sig' } },
    { type: 'content_block_stop', index: 1 },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + STREAM
  replies.push(new Response(signed))
  const first = await drain(options.messages)
  assert.ok(first.replayState)
  const history: Message[] = [
    ...options.messages,
    {
      id: MessageId('signed'), role: 'assistant', content: first.blocks(),
      source: { kind: 'model', provider: options.provider, model: PREFIX_MODEL, replayState: first.replayState },
    },
    userMessage('follow-up', 'what next?'),
  ]
  const sentSignatures = () => requests.map(request => request.body.messages.flatMap(message => message.content)
    .filter(block => block.type === 'thinking').map(block => block.signature))

  replies.push(new Response(JSON.stringify({ error: { message: 'prompt is too long' } }), { status: 400 }))
  await assert.rejects(() => drain(history), (error: unknown) => error instanceof LlmError && error.failure.status === 400)
  assert.deepEqual(sentSignatures(), [[], ['sig']], 'another HTTP 400 is not retried')

  replies.push(new Response(JSON.stringify({ error: { message: 'messages.1.content.0: Invalid `signature` in `thinking` block' } }), { status: 400 }))
  replies.push(new Response(STREAM))
  const fallback = await drain(history)
  assert.deepEqual(sentSignatures(), [[], ['sig'], ['sig'], []])
  assert.ok(fallback.replayState, 'successful fallback remembers the reset even without new thinking')
  replies.push(new Response(STREAM))
  await drain([...history, {
    id: MessageId('reset'), role: 'assistant', content: fallback.blocks(),
    source: { kind: 'model', provider: options.provider, model: PREFIX_MODEL, replayState: fallback.replayState },
  }, userMessage('final', 'continue')])
  assert.deepEqual(sentSignatures().at(-1), [])

  for (const { body, headers } of requests) {
    assert.match(body.system[0].text, /^x-anthropic-billing-header:/)
    assert.deepEqual(body.thinking, { type: 'adaptive', display: 'summarized', block_binding: { prefix_mismatch_behavior: 'drop_block' } })
    const betas = headers.get('anthropic-beta')?.split(',') ?? []
    assert.ok(betas.includes('advanced-tool-use-2025-11-20'))
    assert.ok(betas.includes(CLAUDE_THINKING_BINDING_BETA))
    assert.ok(!betas.includes('redact-thinking-2026-02-12'))
    assert.equal(headers.get('x-claude-code-session-id'), requests[0].headers.get('x-claude-code-session-id'))
  }
})
