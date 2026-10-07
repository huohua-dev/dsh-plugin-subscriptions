/**
 * Claude Code client identity on the subscription endpoint: the
 * billing-attribution block at `system[0]`, the Claude Code `metadata.user_id`
 * shape, the CLI/SDK header set, and the model-gated beta flags — the wire
 * presentation that routes OAuth traffic to the subscription plan instead of
 * the third-party extra-usage lane.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import './keep-alive.js'
import { MessageId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import {
  CLAUDE_ENTRYPOINT,
  applyClaudeCodeIdentity,
  claudeBetaFlags,
  claudeBillingHeader,
  claudeCliUserAgent,
  claudeFakeUserId,
  claudeRequestHeaders,
  claudeStainlessHeaders,
} from '../src/providers/claude-identity.js'
import { ClaudeAdapter, claudeRequestBody } from '../src/providers/claude.js'
import { AccountTokenManager } from '../src/providers/accounts.js'
import type { FetchFn } from '../src/providers/common.js'
import type { ClaudeSession } from '../src/auth/store.js'
import type { TranslatableMessage } from '../src/translate/resolved.js'

const BILLING_PREFIX = 'x-anthropic-billing-header:'

/** Brand a string as a GenerateOptions sessionId (the loop-stamped session identity). */
const SessionId = (id: string): NonNullable<GenerateOptions['sessionId']> =>
  id as NonNullable<GenerateOptions['sessionId']>

/** Session ids ride as UUIDs, like the genuine CLI's; harness ids are hashed. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

test('claudeCliUserAgent presents the sdk-cli entrypoint the billing block names', () => {
  assert.equal(claudeCliUserAgent('2.1.999'), 'claude-cli/2.1.999 (external, sdk-cli)')
  assert.equal(CLAUDE_ENTRYPOINT, 'sdk-cli')
})

test('claudeBetaFlags mirrors the CLI flag set, gated by model and thinking display', () => {
  const opus = claudeBetaFlags('claude-opus-5')
  assert.ok(opus.includes('claude-code-20250219'))
  assert.ok(opus.includes('oauth-2025-04-20'))
  assert.ok(opus.includes('token-efficient-tools-2026-03-28'))
  assert.ok(opus.includes('advanced-tool-use-2025-11-20'), 'heavy-agent flags ride on opus')
  assert.ok(opus.includes('effort-2025-11-24'))

  const haiku = claudeBetaFlags('claude-haiku-4-5-20251001')
  assert.ok(!haiku.includes('advanced-tool-use-2025-11-20'), 'haiku stays on the base set')
  assert.ok(!haiku.includes('effort-2025-11-24'))
  assert.ok(haiku.includes('claude-code-20250219'))

  const summarized = claudeBetaFlags('claude-opus-5', true)
  assert.ok(!summarized.includes('redact-thinking-2026-02-12'), 'redact-thinking blanks requested summaries')
  assert.ok(claudeBetaFlags('claude-opus-5').includes('redact-thinking-2026-02-12'))
})

test('claudeStainlessHeaders carries the SDK telemetry set', () => {
  const headers = claudeStainlessHeaders()
  assert.equal(headers['x-stainless-helper-method'], 'stream')
  assert.equal(headers['x-stainless-retry-count'], '0')
  assert.equal(headers['x-stainless-runtime'], 'node')
  assert.equal(headers['x-stainless-lang'], 'js')
  assert.equal(headers['x-stainless-timeout'], '600')
  assert.match(headers['x-stainless-runtime-version'], /^v\d+/)
  assert.match(headers['x-stainless-package-version'], /^\d+\.\d+\.\d+$/)
  assert.ok(headers['x-stainless-arch'].length > 0)
  assert.ok(headers['x-stainless-os'].length > 0)
})

test('claudeBillingHeader hashes the body and names the presented CLI version', () => {
  const header = claudeBillingHeader({ model: 'claude-opus-5' }, '2.1.999')
  assert.ok(header.startsWith(`${BILLING_PREFIX} cc_version=2.1.999.`))
  assert.ok(header.includes('cc_entrypoint=sdk-cli;'))
  const cch = /cch=([0-9a-f]+);/.exec(header)?.[1]
  assert.equal(cch?.length, 5, 'a short content hash of the body')
  assert.equal(
    cch,
    /cch=([0-9a-f]+);/.exec(claudeBillingHeader({ model: 'claude-opus-5' }, '2.1.999'))?.[1],
    'the hash is deterministic for the same body',
  )
  assert.notEqual(
    cch,
    /cch=([0-9a-f]+);/.exec(claudeBillingHeader({ model: 'claude-opus-5', stream: true }, '2.1.999'))?.[1],
    'a different body hashes differently',
  )
})

test('claudeFakeUserId emits the Claude Code JSON triple, stable per account', () => {
  const parsed = JSON.parse(claudeFakeUserId('alice@example.com', 'sess-abc')) as Record<string, string>
  assert.match(parsed.device_id, /^[0-9a-f]{64}$/)
  assert.match(parsed.account_uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(parsed.session_id, 'sess-abc')
  const again = JSON.parse(claudeFakeUserId('alice@example.com', 'sess-abc')) as Record<string, string>
  assert.equal(again.device_id, parsed.device_id, 'device id survives across requests')
  assert.equal(again.account_uuid, parsed.account_uuid, 'account uuid survives across requests')
})

test('applyClaudeCodeIdentity prepends the billing token ahead of the identity line', () => {
  const body = {
    model: 'claude-opus-5',
    system: [{ type: 'text', text: 'You are Claude Code, Anthropic\'s official CLI for Claude.' }],
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  }
  const identity = applyClaudeCodeIdentity(body, 'sk-ant-oat01-token', '2.1.999', 'sess-abc', 'alice@example.com')
  const system = identity.body.system as Record<string, string>[]
  assert.ok(system[0].text.startsWith(BILLING_PREFIX), 'the billing token is system[0]')
  assert.equal(system[1].text, 'You are Claude Code, Anthropic\'s official CLI for Claude.')
  assert.match(String(identity.sessionHeaderId), UUID_PATTERN)
  const userId = JSON.parse(String((identity.body.metadata as Record<string, string>).user_id)) as Record<string, string>
  assert.equal(userId.session_id, identity.sessionHeaderId, 'the session header echoes metadata.user_id.session_id')
  assert.notEqual(system[0].text, (body.system as Record<string, string>[])[0].text, 'the input body is not mutated')
})

test('applyClaudeCodeIdentity strips a claude: session prefix and mints a session id when absent', () => {
  const stripped = applyClaudeCodeIdentity({ model: 'm' }, 'sk-ant-oat01-token', '2.1.999', 'claude:sess-xyz')
  const plain = applyClaudeCodeIdentity({ model: 'm' }, 'sk-ant-oat01-token', '2.1.999', 'sess-xyz')
  assert.equal(
    stripped.sessionHeaderId,
    plain.sessionHeaderId,
    'the claude: prefix names the same conversation',
  )
  assert.match(String(stripped.sessionHeaderId), UUID_PATTERN, 'harness ids ride as UUIDs')
  const minted = applyClaudeCodeIdentity({ model: 'm' }, 'sk-ant-oat01-token', '2.1.999')
  assert.match(String(minted.sessionHeaderId), UUID_PATTERN, 'a UUID stands in for the conversation')
})

test('applyClaudeCodeIdentity leaves API-key traffic in the plain API lane', () => {
  const bare = applyClaudeCodeIdentity({ model: 'm' }, 'sk-ant-api03-key', '2.1.999')
  assert.equal('system' in bare.body, false)
  assert.equal('metadata' in bare.body, false)
  assert.equal(bare.sessionHeaderId, undefined)
  const legacy = applyClaudeCodeIdentity({ model: 'm' }, 'sk-ant-api03-key', '2.1.999', 'sess-abc')
  assert.deepEqual(legacy.body.metadata, { user_id: 'sess-abc' })
})

test('claudeRequestHeaders assembles the CLI surface with the session header', () => {
  const headers = claudeRequestHeaders('sk-ant-oat01-token', '2.1.999', 'claude-opus-5', true, 'sess-abc')
  assert.equal(headers.authorization, 'Bearer sk-ant-oat01-token')
  assert.equal(headers['anthropic-version'], '2023-06-01')
  assert.equal(headers['user-agent'], 'claude-cli/2.1.999 (external, sdk-cli)')
  assert.equal(headers['x-app'], 'cli')
  assert.equal(headers['accept'], 'text/event-stream')
  assert.equal(headers['x-claude-code-session-id'], 'sess-abc')
  assert.equal(headers['anthropic-beta'], claudeBetaFlags('claude-opus-5', true))
  assert.equal(headers['x-stainless-lang'], 'js')
  const withoutSession = claudeRequestHeaders('k', '2.1.999', 'claude-haiku-4-5-20251001')
  assert.equal('x-claude-code-session-id' in withoutSession, false)
})

/** A fetch answering with one minimal Claude SSE stream, recording the request. */
function captureFetch(): { fetchFn: FetchFn; requests: { url: string; init: RequestInit }[] } {
  const requests: { url: string; init: RequestInit }[] = []
  const stream = [
    { type: 'message_start', message: { usage: { input_tokens: 1, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'hi' } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 1 } },
    { type: 'message_stop' },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('')
  const fetchFn = ((url: string, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} })
    return Promise.resolve(new Response(stream, {
      status: 200,
      headers: { 'content-type': 'text/event-stream' },
    }))
  }) as FetchFn
  return { fetchFn, requests }
}

const CLAUDE_SESSION: ClaudeSession = {
  accessToken: 'sk-ant-oat01-token',
  refreshToken: 'refresh',
  expiresAt: Date.now() + 3_600_000,
  scopes: 'user:inference',
  emailAddress: 'alice@example.com',
}

function memoryTokens(session: ClaudeSession | undefined): AccountTokenManager<ClaudeSession> {
  let stored = session
  return new AccountTokenManager<ClaudeSession>({
    provider: 'claude',
    displayName: 'Test',
    makeOptions: () => ({
      preemptMs: 0,
      refresh: value => Promise.resolve(value),
      isPermanent: () => false,
    }),
    io: {
      list: () => Promise.resolve(stored === undefined ? [] : [{ key: 'acct', session: stored }]),
      get: () => Promise.resolve(stored),
      save: (_account, value) => {
        stored = value
        return Promise.resolve()
      },
      remove: () => {
        stored = undefined
        return Promise.resolve()
      },
    },
  })
}

test('the wire request carries the billing block, Claude Code metadata and the CLI headers', async () => {
  const { fetchFn, requests } = captureFetch()
  const adapter = new ClaudeAdapter({
    models: [{ id: 'claude-opus-5', name: 'Claude Opus 5' }],
    streamIdleTimeoutMs: 5_000,
    tokens: memoryTokens(CLAUDE_SESSION),
    discovery: false,
    fetchFn,
    resolveCliVersion: () => Promise.resolve('2.1.999'),
  })
  const messages: Message[] = [{
    id: MessageId('u0'),
    role: 'user',
    content: [{ type: 'text', text: 'hi' }],
    source: { kind: 'user' },
  }]
  for await (const _chunk of adapter.stream({
    provider: 'claude', model: 'claude-opus-5', messages, sessionId: SessionId('sess-abc'),
  })) { /* drain */ }

  assert.equal(requests.length, 1)
  const headers = new Headers(requests[0].init.headers)
  assert.equal(headers.get('user-agent'), 'claude-cli/2.1.999 (external, sdk-cli)')
  assert.equal(headers.get('x-app'), 'cli')
  assert.ok(headers.get('x-claude-code-session-id'), 'session header present')
  assert.ok(String(headers.get('anthropic-beta')).includes('advanced-tool-use-2025-11-20'))
  assert.ok(headers.get('x-stainless-package-version'), 'SDK telemetry rides along')

  const body = JSON.parse(String(requests[0].init.body)) as {
    system: Record<string, string>[]
    metadata: { user_id: string }
  }
  assert.ok(body.system[0].text.startsWith(`${BILLING_PREFIX} cc_version=2.1.999.`))
  assert.ok(body.system[0].text.includes('cc_entrypoint=sdk-cli;'))
  assert.ok(body.system[1].text.startsWith('You are Claude Code'))
  const userId = JSON.parse(body.metadata.user_id) as Record<string, string>
  assert.equal(
    headers.get('x-claude-code-session-id'),
    userId.session_id,
    'the session header matches metadata.user_id.session_id',
  )
  assert.match(userId.device_id, /^[0-9a-f]{64}$/)
})

test('claudeRequestBody ends on a user turn unless the harness chose prefill', () => {
  const lostTrailingTurn: TranslatableMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'go' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'done' }] },
    { role: 'user', content: [] },
  ]
  const restored = claudeRequestBody(
    { provider: 'claude', model: 'claude-opus-5', messages: [] },
    lostTrailingTurn,
    32_000,
  )
  const restoredMessages = restored.messages as { role: string; content: { text?: string }[] }[]
  assert.equal(restoredMessages[restoredMessages.length - 1].role, 'user')
  assert.equal(restoredMessages[restoredMessages.length - 1].content[0].text, 'Continue.')

  const prefill: TranslatableMessage[] = [
    { role: 'user', content: [{ type: 'text', text: 'go' }] },
    { role: 'assistant', content: [{ type: 'text', text: 'partial' }] },
  ]
  const kept = claudeRequestBody(
    { provider: 'claude', model: 'claude-opus-5', messages: [] },
    prefill,
    32_000,
  )
  const keptMessages = kept.messages as { role: string }[]
  assert.equal(keptMessages[keptMessages.length - 1].role, 'assistant', 'prefill is the harness\'s choice')
})
