/**
 * Meta Muse Code provider tests: the device-flow spec, the key mint (login,
 * refresh, usage), catalog discovery fallback, the Responses request shape,
 * and the encrypted-reasoning replay envelope across a tool round trip.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  MUSE_API_URL,
  MUSE_CLIENT_ID,
  MUSE_KEY_URL,
  MUSE_MODELS_URL,
  MUSE_NETWORK_BLOCKED_CODE,
  MUSE_DANGLING_STOP_NOTICE,
  MuseAdapter,
  completeMuseLogin,
  fetchMuseModels,
  isMusePermanentRefreshError,
  museAnnouncesAction,
  museDeviceFlow,
  museDanglingText,
  museHeaders,
  museMergedUsage,
  museMidToolLoop,
  museModelName,
  museReasoningIndex,
  museRequestBody,
  museUsageFromKey,
  museUserAgent,
  refreshMuse,
} from '../src/providers/muse.js'
import type { MuseReplayResponse } from '../src/providers/muse.js'
import { AccountTokenManager } from '../src/providers/accounts.js'
import { DeviceFlowManager } from '../src/auth/device-flow.js'
import { accountKeyOf } from '../src/auth/store.js'
import type { MuseSession } from '../src/auth/store.js'
import { toResponsesInput } from '../src/translate/responses.js'

/** The live mint response shape (values anonymized). */
const MINT = {
  api_key: 'LLM|1234|secret',
  base_url: 'https://api.meta.ai/v1',
  has_payment_method: false,
  require_payment: false,
  is_subs_active: true,
  user_full_name: 'Test User',
  user_email: 'user@example.com',
  action_url: null,
  subs_tier_id: '1',
  subs_tier_name: 'Muse Code Everyday Usage',
  subs_usage: {
    window: { used_percent: 12, window_duration_mins: 300, resets_at: 1_791_966_644 },
    weekly: { used_percent: 4, resets_at: 1_792_368_000 },
    tier: '1',
  },
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** A fetch stub that records every call and answers through `answer`. */
function recordingFetch(answer: (url: string, init: RequestInit | undefined, index: number) => Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = []
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    return Promise.resolve(answer(url, init, calls.length - 1))
  }) as typeof fetch
  return { calls, fetchFn }
}

test('museDeviceFlow uses the Muse CLI client id and sends no scope', async () => {
  const spec = museDeviceFlow()
  assert.equal(spec.clientId, MUSE_CLIENT_ID)
  assert.equal(spec.scope, undefined)
  const { calls, fetchFn } = recordingFetch(url => url === spec.deviceCodeUrl
    ? json({
      device_code: 'dc', user_code: 'ABCD-EFGH', interval: 1, expires_in: 600,
      verification_uri: 'https://auth.meta.com/oauth/device/',
      verification_uri_complete: 'https://auth.meta.com/oauth/device/?code=ABCD-EFGH',
    })
    : json({ access_token: 'dca:identity', token_type: 'Bearer' }))
  const manager = new DeviceFlowManager()
  const attempt = await manager.start('muse', { ...spec, fetchFn })
  // The complete URI already carries the code: the user only confirms it.
  assert.equal(attempt.verificationUrl, 'https://auth.meta.com/oauth/device/?code=ABCD-EFGH')
  assert.equal(attempt.userCode, 'ABCD-EFGH')
  const body = new URLSearchParams(String(calls[0]?.init?.body))
  assert.equal(body.get('client_id'), MUSE_CLIENT_ID)
  assert.equal(body.has('scope'), false)
  assert.equal((calls[0]?.init?.headers as Record<string, string>)['user-agent'], 'muse-code/launcher-3')
  attempt.cancel()
})

test('completeMuseLogin mints the key and stores the identity token for re-minting', async () => {
  const { calls, fetchFn } = recordingFetch(() => json(MINT))
  const session = await completeMuseLogin('dca:identity', fetchFn)
  assert.equal(calls[0]?.url, MUSE_KEY_URL)
  assert.equal((calls[0]?.init?.headers as Record<string, string>).authorization, 'Bearer dca:identity')
  assert.equal((calls[0]?.init?.headers as Record<string, string>)['x-api-version'], '1.0.0')
  assert.equal(session.accessToken, MINT.api_key)
  assert.equal(session.refreshToken, 'dca:identity')
  assert.equal(session.account, 'user@example.com')
  assert.equal(session.plan, 'Muse Code Everyday Usage')
  assert.ok(session.expiresAt > Date.now() + 23 * 3_600_000)
  assert.equal(accountKeyOf('muse', session), 'user@example.com')
})

test('completeMuseLogin refuses inactive subscriptions and billing-gated accounts', async () => {
  await assert.rejects(
    completeMuseLogin('dca:x', recordingFetch(() => json({ ...MINT, is_subs_active: false })).fetchFn),
    /no active Muse Code subscription/,
  )
  await assert.rejects(
    completeMuseLogin('dca:x', recordingFetch(() => json({ ...MINT, require_payment: true })).fetchFn),
    /payment method/,
  )
  await assert.rejects(
    completeMuseLogin('dca:x', recordingFetch(() => json({ ...MINT, api_key: '' })).fetchFn),
    /no api_key/,
  )
})

test('refreshMuse re-mints from the identity token; a rejected identity is permanent', async () => {
  const previous: MuseSession = { accessToken: 'old', refreshToken: 'dca:identity', expiresAt: 0, account: 'kept@example.com' }
  const next = await refreshMuse(previous, recordingFetch(() => json({ api_key: 'LLM|new' })).fetchFn)
  assert.equal(next.accessToken, 'LLM|new')
  assert.equal(next.refreshToken, 'dca:identity')
  assert.equal(next.account, 'kept@example.com', 'a mint without identity fields keeps the stored account')
  const failure = await refreshMuse(previous, recordingFetch(() =>
    json({ error: { message: 'Invalid or expired API key', code: 'invalid_api_key' } }, 401)).fetchFn).catch((error: unknown) => error)
  assert.equal(isMusePermanentRefreshError(failure), true)
  const transient = await refreshMuse(previous, recordingFetch(() => json({}, 503)).fetchFn).catch((error: unknown) => error)
  assert.equal(isMusePermanentRefreshError(transient), false)
})

test('museUsageFromKey maps the 5-hour and weekly windows with second-based resets', () => {
  const usage = museUsageFromKey(MINT)
  assert.deepEqual(usage, {
    supported: true,
    plan: 'Muse Code Everyday Usage',
    windows: [
      { kind: 'session', usedPercent: 12, resetsAt: 1_791_966_644_000 },
      { kind: 'weekly', usedPercent: 4, resetsAt: 1_792_368_000_000 },
    ],
  })
  const odd = museUsageFromKey({ subs_usage: { window: { used_percent: 1, window_duration_mins: 60 } } })
  assert.equal(odd.windows?.[0]?.kind, 'other', 'a non-5-hour short window is not mislabelled')
})

/** One live `/muse-code/models` entry (shape as served). */
const catalogEntry = (id: string, meta: Record<string, unknown> = {}) => ({
  id,
  object: 'model',
  owned_by: 'meta',
  metadata: {
    'muse-code': {
      name: id, family: 'avocado', is_hidden: false, attachment: true, reasoning: true, tool_call: true,
      modalities: { input: ['text', 'image'], output: ['text'] },
      limit: { context: 1_007_997, output: 128_000 },
      options: { reasoningEffort: 'high', include: ['reasoning.encrypted_content'] },
      variants: Object.fromEntries(['minimal', 'low', 'medium', 'high', 'xhigh', 'max'].map(e => [e, { reasoningEffort: e }])),
      ...meta,
    },
  },
})

test('fetchMuseModels reads the muse-code catalog and treats an empty list as a gated network', async () => {
  const session: MuseSession = { accessToken: 'LLM|k', refreshToken: 'dca:i', expiresAt: Date.now() + 1e6 }
  await assert.rejects(
    fetchMuseModels(session, recordingFetch(() => json({ object: 'list', data: [] })).fetchFn),
    /empty catalog\. Meta returns an empty model catalog to some networks/,
  )
  const { calls, fetchFn } = recordingFetch(() => json({
    object: 'list',
    data: [
      catalogEntry('muse-wonder-1.0'),
      catalogEntry('muse-image-1.0', { is_hidden: true, tool_call: false, modalities: { input: ['text', 'image'], output: ['image'] }, limit: null }),
      catalogEntry('muse-spark-1.3-contributor', { variants: { low: { reasoningEffort: 'low' } }, options: {} }),
    ],
  }))
  const models = await fetchMuseModels(session, fetchFn)
  assert.equal(calls[0]?.url, 'https://api.meta.ai/muse-code/models')
  assert.deepEqual(models.map(model => model.id), ['muse-wonder-1.0', 'muse-spark-1.3-contributor'])
  assert.equal(models[0]?.name, 'Muse Wonder 1.0')
  assert.equal(models[0]?.contextWindow, 1_007_997)
  assert.equal(models[0]?.maxOutputTokens, 128_000)
  assert.deepEqual(models[0]?.inputModalities, ['text', 'image'])
  assert.deepEqual(models[0]?.reasoning?.efforts.map(effort => effort.id), ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(models[0]?.reasoning?.defaultEffort, 'high')
  assert.deepEqual(models[1]?.reasoning, { efforts: [{ id: 'low', name: 'Low' }] }, 'per-model variants win; no default it does not list')
  assert.equal(museModelName('muse-spark-1.2'), 'Muse Spark 1.2')
})

test('museUserAgent presents a headless Muse CLI build', () => {
  assert.equal(museUserAgent('darwin', 'arm64'), 'muse-build/1.4.7 (non-interactive; macos-aarch64)')
  assert.equal(museUserAgent('linux', 'x64'), 'muse-build/1.4.7 (non-interactive; linux-x86_64)')
  // DSH attribution must not replace the CLI user agent on inference calls.
  assert.equal(museHeaders('key', 's1')['user-agent'], museUserAgent())
  assert.equal(museHeaders('key', 's1')['x-meta-ai-gateway-session-id'], museHeaders('key', 's1')['x-tbh-session-id'])
})

const USER = {
  id: MessageId('u1'),
  role: 'user' as const,
  content: [{ type: 'text' as const, text: 'weather?' }],
  source: { kind: 'user' as const },
}

const TOOLS = [{ name: 'get_weather', description: 'weather', parameters: { type: 'object', properties: {} } }]

test('museRequestBody mirrors the Muse CLI request shape', () => {
  const options = {
    provider: 'muse', model: 'muse-spark-1.3', messages: [USER], maxTokens: 4096,
    reasoningEffort: 'low', sessionId: 's-1', tools: TOOLS,
  } as unknown as GenerateOptions
  const body = museRequestBody(options, toResponsesInput([USER], 'sys'))
  assert.equal(body.instructions, 'sys')
  assert.deepEqual(body.reasoning, { effort: 'low', summary: 'auto' })
  assert.deepEqual(body.include, ['reasoning.encrypted_content'])
  assert.equal(body.tool_choice, 'auto')
  assert.equal(body.store, false)
  assert.equal(body.stream, true)
  assert.equal(body.prompt_cache_key, 's-1')
  assert.equal(body.max_output_tokens, 4096)
  const bare = museRequestBody({ provider: 'muse', model: 'm', messages: [USER] } as unknown as GenerateOptions, toResponsesInput([USER]))
  assert.ok(!('tools' in bare) && !('tool_choice' in bare) && !('reasoning' in bare) && !('prompt_cache_key' in bare))
})

const sse = (events: unknown[]): Response => new Response(
  events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''),
  { headers: { 'content-type': 'text/event-stream' } },
)

const REASONING_ITEM = { type: 'reasoning' as const, id: 'rs_1', summary: [], status: 'completed', encrypted_content: 'enc-blob' }

/** A tool-calling response: one reasoning item, then one function call. */
const TOOL_CALL_EVENTS = [
  { type: 'response.output_item.added', output_index: 0, item: { type: 'reasoning', id: 'rs_1' } },
  { type: 'response.output_item.done', output_index: 0, item: REASONING_ITEM },
  { type: 'response.output_item.added', output_index: 1, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_weather' } },
  { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{}' },
  { type: 'response.output_item.done', output_index: 1, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_weather', arguments: '{}' } },
  { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 3 } } },
]

const TEXT_EVENTS = [
  { type: 'response.output_text.delta', item_id: 'msg_1', delta: 'sunny' },
  { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } },
  { type: 'response.completed', response: { usage: { input_tokens: 9, output_tokens: 1 } } },
]

function memoryTokens(session: MuseSession): AccountTokenManager<MuseSession> {
  let stored: MuseSession | undefined = session
  return new AccountTokenManager<MuseSession>({
    provider: 'muse',
    displayName: 'Test',
    makeOptions: () => ({ preemptMs: 0, refresh: s => Promise.resolve(s), isPermanent: () => false }),
    io: {
      list: () => Promise.resolve(stored === undefined ? [] : [{ key: 'acct', session: stored }]),
      get: () => Promise.resolve(stored),
      save: (_account, next) => { stored = next; return Promise.resolve() },
      remove: () => { stored = undefined; return Promise.resolve() },
    },
  })
}

function museAdapter(fetchFn: typeof fetch): MuseAdapter {
  return new MuseAdapter({
    models: [{ id: 'muse-spark-1.3' }],
    streamIdleTimeoutMs: 1000,
    tokens: memoryTokens({ accessToken: 'LLM|k', refreshToken: 'dca:i', expiresAt: Date.now() + 3_600_000 }),
    discovery: false,
    fetchFn,
    modelNotFoundBackoffMs: [1, 1],
  })
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

/** The assistant turn the harness would store from the tool-calling response. */
function assistantTurn(replayState: unknown, model = 'muse-spark-1.3') {
  return {
    id: MessageId('a1'),
    role: 'assistant' as const,
    content: [{ type: 'tool-call' as const, id: ToolCallId('call_1'), name: 'get_weather', arguments: '{}' }],
    source: { kind: 'model' as const, provider: 'muse', model, replayState },
  }
}

const TOOL_RESULT = {
  id: MessageId('t1'),
  role: 'tool' as const,
  toolCallId: ToolCallId('call_1'),
  content: [{ type: 'text' as const, text: 'sunny' }],
  source: { kind: 'tool' as const, callId: ToolCallId('call_1') },
}

test('a tool-calling response carries its reasoning in the replay envelope, and the next request replays it', async () => {
  const { calls, fetchFn } = recordingFetch((_url, _init, index) => sse(index === 0 ? TOOL_CALL_EVENTS : TEXT_EVENTS))
  const adapter = museAdapter(fetchFn)
  const first = await collect(adapter.stream({
    provider: 'muse', model: 'muse-spark-1.3', messages: [USER], tools: TOOLS, sessionId: 's-1',
  } as unknown as GenerateOptions))
  assert.equal(calls[0]?.url, MUSE_API_URL)
  const headers = calls[0]?.init?.headers as Record<string, string>
  assert.equal(headers.authorization, 'Bearer LLM|k')
  assert.equal(headers['x-client-id'], 'tbh:exec')
  assert.equal(headers['x-tbh-session-id'], headers['x-meta-ai-gateway-session-id'])
  const finish = first.at(-1)
  assert.equal(finish?.type, 'finish')
  assert.ok(finish?.type === 'finish' && finish.reason.kind === 'tool-calls')
  const replay = finish?.type === 'finish' ? finish.replayState?.response as MuseReplayResponse : undefined
  assert.deepEqual(replay, { kind: 'muse', version: 1, account: 'acct', calls: ['call_1'], reasoning: [REASONING_ITEM] })

  const second = await collect(adapter.stream({
    provider: 'muse', model: 'muse-spark-1.3', tools: TOOLS,
    messages: [USER, assistantTurn({ response: replay }), TOOL_RESULT],
  } as unknown as GenerateOptions))
  assert.equal(second.at(-1)?.type, 'finish')
  const input = JSON.parse(String(calls[1]?.init?.body)).input as { type: string }[]
  assert.deepEqual(input.map(item => item.type), ['message', 'reasoning', 'function_call', 'function_call_output'])
  assert.deepEqual(input[1], REASONING_ITEM)
})

test('replay is skipped for another model or account, and a 400 on replay retries without it', async () => {
  const replay: MuseReplayResponse = { kind: 'muse', version: 1, account: 'acct', calls: ['call_1'], reasoning: [REASONING_ITEM] }
  const base = [USER, assistantTurn({ response: replay }), TOOL_RESULT] as unknown as GenerateOptions['messages']
  assert.equal(museReasoningIndex(base, 'muse', 'muse-spark-1.3', 'acct').get('call_1')?.length, 1)
  assert.equal(museReasoningIndex(base, 'muse', 'muse-spark-1.2', 'acct').size, 0, 'blobs are model-bound')
  assert.equal(museReasoningIndex(base, 'muse', 'muse-spark-1.3', 'other').size, 0, 'blobs are credential-bound')

  const { calls, fetchFn } = recordingFetch((_url, _init, index) => index === 0
    ? json({ error: { code: 'invalid_request', message: 'bad reasoning item' } }, 400)
    : sse(TEXT_EVENTS))
  const chunks = await collect(museAdapter(fetchFn).stream({
    provider: 'muse', model: 'muse-spark-1.3', messages: base,
  } as unknown as GenerateOptions))
  assert.equal(calls.length, 2)
  const retried = JSON.parse(String(calls[1]?.init?.body)).input as { type: string }[]
  assert.ok(!retried.some(item => item.type === 'reasoning'))
  assert.equal(chunks.at(-1)?.type, 'finish')
})

test('a gated network falls back to the static catalog with one warning; a persistent model 404 is a retryable server failure', async () => {
  const { fetchFn } = recordingFetch(() => json({ object: 'list', data: [] }))
  const warnings: string[] = []
  const adapter = new MuseAdapter({
    models: [{ id: 'muse-spark-1.3', name: 'Muse Spark 1.3' }],
    streamIdleTimeoutMs: 1000,
    tokens: memoryTokens({ accessToken: 'LLM|k', refreshToken: 'dca:i', expiresAt: Date.now() + 3_600_000 }),
    discovery: true,
    fetchFn,
    onWarn: message => warnings.push(message),
  })
  const models = await adapter.listOwnModels('muse')
  assert.deepEqual(models.map(model => model.id), ['muse-spark-1.3'])
  await adapter.listOwnModels('muse')
  assert.equal(warnings.length, 1, 'the gated-catalog warning is not repeated on every picker read')
  assert.match(warnings[0] ?? '', /empty model catalog to some networks/)
  const info = await adapter.resolveOwnModel('muse', 'muse-spark-1.3')
  assert.equal(info.reasoning?.defaultEffort, 'high')
  assert.deepEqual(info.reasoning?.efforts.map(effort => effort.id), ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(info.context?.contextWindow, 1_007_997)
  assert.deepEqual(info.inputModalities, ['text', 'image'])

  // A network that lists the catalog: the 404 is the account still poisoned
  // from elsewhere, retried in place and then handed to the harness.
  const notFound = recordingFetch(url => url === MUSE_MODELS_URL
    ? json({ object: 'list', data: [{ id: 'muse-spark-1.3' }] })
    : json({ error: { code: 'model_not_found', message: 'The requested model was not found.' } }, 404))
  await assert.rejects(
    collect(museAdapter(notFound.fetchFn).stream({ provider: 'muse', model: 'muse-spark-1.3', messages: [USER] } as unknown as GenerateOptions)),
    (error: Error & { code?: string }) => error.code === 'SERVER'
      && /refuses this model for the account/.test(error.message) && /after 3 attempts/.test(error.message),
  )
  assert.equal(notFound.calls.filter(call => call.url === MUSE_API_URL).length, 3, 'two backoff retries after the first attempt')
  assert.equal(notFound.calls.filter(call => call.url === MUSE_MODELS_URL).length, 1, 'the network is checked once')
})

test('a gated account still pools the models another account listed (issue: quota exhausted with quota left)', async () => {
  // One login sees the catalog, the rest are answered an empty one. A gated
  // account's catalog is UNKNOWN, so it must not fall back to a list that
  // omits the live model: that silently leaves the model's pool with one
  // member, and the member's closed window ends the turn as a terminal quota
  // error while the other accounts sit idle with quota to spare.
  const sessions = new Map(['live', 'gated-one', 'gated-two'].map((key, index) => [key, {
    accessToken: `LLM|${String(index)}`, refreshToken: `dca:${key}`, expiresAt: Date.now() + 3_600_000,
  } satisfies MuseSession]))
  const tokens = new AccountTokenManager<MuseSession>({
    provider: 'muse',
    displayName: 'Test',
    makeOptions: () => ({ preemptMs: 0, refresh: s => Promise.resolve(s), isPermanent: () => false }),
    io: {
      list: () => Promise.resolve([...sessions].map(([key, session]) => ({ key, session }))),
      get: account => Promise.resolve(account === undefined ? undefined : sessions.get(account)),
      save: (account, session) => { sessions.set(account, session); return Promise.resolve() },
      remove: account => { sessions.delete(account); return Promise.resolve() },
    },
  })
  // Meta answers each account's own bearer token; the gated ones get `data: []`.
  const fetchFn = ((input: RequestInfo | URL, init?: RequestInit) => {
    const live = (init?.headers as Record<string, string> | undefined)?.authorization === 'Bearer LLM|0'
    return Promise.resolve(String(input) === MUSE_MODELS_URL
      ? json(live
        ? { object: 'list', data: [catalogEntry('muse-spark-1.3'), catalogEntry('muse-wonder-full-1.0')] }
        : { object: 'list', data: [] })
      : json({ error: { code: 'rate_limit_exceeded' } }, 429))
  }) as typeof fetch
  const adapter = new MuseAdapter({
    models: [{ id: 'muse-spark-1.3', name: 'Muse Spark 1.3' }],
    streamIdleTimeoutMs: 1000,
    tokens,
    discovery: true,
    fetchFn,
    onWarn: () => undefined,
  })

  const live = await adapter.listOwnModels('muse', 'live')
  assert.deepEqual(live.map(model => model.id), ['muse-spark-1.3', 'muse-wonder-full-1.0'])
  for (const account of ['gated-one', 'gated-two']) {
    const models = await adapter.listOwnModels('muse', account)
    assert.ok(models.some(model => model.id === 'muse-wonder-full-1.0'),
      `${account} must keep muse-wonder-full-1.0 in the pool: a gated catalog is unknown, not empty`)
    assert.deepEqual(models.map(model => model.id), ['muse-spark-1.3', 'muse-wonder-full-1.0'],
      `${account} adds nothing the provider is not already serving`)
  }
})

test('a connection closed mid-request is a TRANSPORT failure that names the closed socket', async () => {
  // undici's shape when the far side drops an upload: a bare "fetch failed"
  // whose cause is the socket error. The pool and harness show only the
  // message, so the cause must be in it.
  const closed = Object.assign(new Error('other side closed'), { code: 'UND_ERR_SOCKET' })
  const fetchFn = (() => Promise.reject(new TypeError('fetch failed', { cause: closed }))) as typeof fetch
  await assert.rejects(
    collect(museAdapter(fetchFn).stream({ provider: 'muse', model: 'muse-spark-1.3', messages: [USER] } as unknown as GenerateOptions)),
    (error: Error & { code?: string; cause?: unknown }) => error.code === 'TRANSPORT'
      && error.message === 'muse API request failed: fetch failed → other side closed (UND_ERR_SOCKET)'
      && error.cause instanceof TypeError,
  )
})

const MODEL_NOT_FOUND = { error: { code: 'model_not_found', message: 'The requested model was not found.' } }

test('a transient model_not_found is retried until the gateway serves the model', async () => {
  let inference = 0
  const { calls, fetchFn } = recordingFetch(url => {
    if (url === MUSE_MODELS_URL) return json({ object: 'list', data: [{ id: 'muse-wonder-1.0' }] })
    return inference++ < 2 ? json(MODEL_NOT_FOUND, 404) : sse(TEXT_EVENTS)
  })
  const chunks = await collect(museAdapter(fetchFn).stream({
    provider: 'muse', model: 'muse-wonder-1.0', messages: [USER],
  } as unknown as GenerateOptions))
  assert.equal(calls.filter(call => call.url === MUSE_API_URL).length, 3)
  const finish = chunks.at(-1)
  assert.ok(finish?.type === 'finish' && finish.reason.kind === 'stop')
})

test('a model_not_found on a blocked network fails at once and later requests check the network before sending', async () => {
  let catalog: unknown[] = []
  let clock = 1_000_000
  const { calls, fetchFn } = recordingFetch(url => url === MUSE_MODELS_URL
    ? json({ object: 'list', data: catalog })
    : catalog.length === 0 ? json(MODEL_NOT_FOUND, 404) : sse(TEXT_EVENTS))
  const adapter = new MuseAdapter({
    models: [{ id: 'muse-spark-1.3' }],
    streamIdleTimeoutMs: 1000,
    tokens: memoryTokens({ accessToken: 'LLM|k', refreshToken: 'dca:i', expiresAt: Date.now() + 3_600_000 }),
    discovery: false,
    fetchFn,
    modelNotFoundBackoffMs: [1, 1],
    now: () => clock,
  })
  const request = { provider: 'muse', model: 'muse-spark-1.3', messages: [USER] } as unknown as GenerateOptions
  const blocked = (error: Error & { code?: string; failure?: { status?: number } }) =>
    error.code === MUSE_NETWORK_BLOCKED_CODE && /blocking Muse on this network/.test(error.message)
  const sent = () => calls.filter(call => call.url === MUSE_API_URL).length

  await assert.rejects(collect(adapter.stream(request)), blocked)
  assert.equal(sent(), 1, 'no retry from a blocked network: each refusal poisons the account elsewhere')

  await assert.rejects(collect(adapter.stream(request)), blocked)
  assert.equal(sent(), 1, 'a repeat within the window is refused before anything is sent')

  await assert.rejects(collect(adapter.stream({ ...request, model: 'muse-wonder-1.0' } as GenerateOptions)), blocked)
  assert.equal(sent(), 2, 'the hold is per model: a blocked network may still serve another one')

  catalog = [{ id: 'muse-spark-1.3' }]
  const chunks = await collect(adapter.stream(request))
  assert.equal(chunks.at(-1)?.type, 'finish', 'an unblocked network sends again')
  assert.equal(sent(), 3)

  catalog = []
  clock += 10 * 60_000
  await assert.rejects(collect(adapter.stream(request)), blocked)
  const probesBefore = calls.filter(call => call.url === MUSE_MODELS_URL).length
  clock += 10 * 60_000
  await assert.rejects(collect(adapter.stream(request)), blocked)
  assert.equal(sent(), 5, 'past the window the request is sent (and refused) again')
  assert.equal(calls.filter(call => call.url === MUSE_MODELS_URL).length, probesBefore + 1, 'only the post-404 check runs')
})

test('an unrelated 404 is not retried', async () => {
  const { calls, fetchFn } = recordingFetch(() => json({ title: 'Not Found', detail: "Path '/x' was not found" }, 404))
  await assert.rejects(
    collect(museAdapter(fetchFn).stream({ provider: 'muse', model: 'muse-wonder-1.0', messages: [USER] } as unknown as GenerateOptions)),
    (error: Error & { code?: string }) => error.code === 'HTTP_404',
  )
  assert.equal(calls.length, 1)
})


// ── Turns the model ends early ──────────────────────────────────────────────
// Real replies from recorded sessions where Muse announced its next step and
// stopped (the user had to type "continue"), and real final answers.

const ENDED_EARLY = [
  '结果出来了：5090 上只有 2 个 SDXL 底模、**没有绫华 LoRA、也没有任何 ControlNet 模型**——所以能锁姿势的路就是拿原图做图生图重绘。再确认几个关键细节节点的输入格式，我就拼工作流。',
  '原图已传上 5090（`ayaka_ref/ref_original.jpg`）。现在按三档重绘强度跑图生图：WAI 低强度（最还原姿势）、WAI 高强度（多给模型修身材的余地）、NoobAI 中强度（测它的绫华识别）：',
  '第一张（WAI 低强度）已经把原图姿势锁住了，先看完另外两档再一起对比。',
  '核心证据已集齐，最后核对两件事：CLI 有没有批量建任务的子命令，以及「任务并发上限」会不会让批量开启自动排队。',
  '目录已被 Git 忽略，继续跑静态构建验证，并核查 DSH 这边的预览方式不受影响（本改动只动 ARTEX 前端，不涉及 DSH GUI）。',
  '抓到插件本体的堆栈了。提取主 goroutine 和几个可疑的阻塞点：',
  '第一档出来了，姿势和身材明显回到原图了。继续看剩下两张。',
  '提示词记在 [v2.md](</tmp/prompts/v2.md>)。先跑最保守的一档——WAI 图生图、去噪 0.55，姿势和原图应该几乎重合：',
  'Now I will run the build and then check the output.',
  'Let me read the config file first:',
  // Recorded 2026-10-17 (dsh-compaction-policy): the guard missed these and the
  // user had to type "continue" — a description "你看到…" tripped the hand-back
  // test, and the noun "调查结论" tripped the done test.
  '找到关键点了：宿主在**导入插件代码之前**就有一层兼容性判定（看 `engines.dsh` 或 dsh peer 依赖），你看到的不兼容报错来自那一层。我把那段判定逻辑完整抠出来看。',
  '三层门全摸清了：宿主 manifest 门（你看到的报错）→ 插件导入时精确版本 throw → 方法哈希门。真正的兼容契约只有第三层，前面两层都在用版本号重复设卡。这次按「版本号只做宽范围准入、哈希做真契约、不合时优雅停用而非报错」来重构。',
  '调查结论已经完整，正在移除 256 硬上限并同步所有引用。',
]

const REAL_ANSWERS = [
  '已推送。',
  '完成，测试全部通过。',
  'All 42 tests pass.',
  '没有发现问题。',
  '修好了：把 `retry` 的默认值从 3 改成 5。',
  '要我现在就开始实现吗？',
  'If you want, I can run the tests next.',
  '我有两个方案，你想用哪个：',
  '完成：\n- 改了 a.ts\n- 改了 b.ts',
  '改好了：\n```ts\nconst x = 1\n```',
  '',
  `${'这是一份完整的总结，列出了改动、验证方式和遗留风险。'.repeat(20)}`,
]

test('museDanglingText flags a short reply that announces what comes next, and leaves answers alone', () => {
  for (const text of ENDED_EARLY) assert.equal(museDanglingText(text), true, text)
  for (const text of REAL_ANSWERS) assert.equal(museDanglingText(text), false, text)
})

test('only the last sentence can hand control back to the user', () => {
  // A mention in an explanation is a description, not a question.
  assert.equal(museDanglingText('你看到的不兼容报错来自宿主门禁。我先确认判定逻辑再改。'), true)
  // 结论 as a noun is not a "done" report; 结论如下 is.
  assert.equal(museDanglingText('调查结论已经完整，正在移除 256 硬上限并同步所有引用。'), true)
  assert.equal(museDanglingText('结论如下：只改了版本号。'), false)
  // A real offer or instruction to the user still ends the turn.
  assert.equal(museDanglingText('修好了，你可以在日志里核对。'), false)
  assert.equal(museDanglingText('你看这样改行不行？'), false)
})

test('museAnnouncesAction catches an announcement at the start of a turn, and only that', () => {
  // Recorded 2026-10-17: the user typed "创建v0.2.2 tag" and the turn stopped here.
  assert.equal(museAnnouncesAction('我来给当前已推送的提交创建 `v0.2.2` 标签并推送。'), true)
  assert.equal(museAnnouncesAction('现在跑三档重绘：'), true)
  assert.equal(museAnnouncesAction('目前正在逐模块覆盖剩余面。'), true)
  // A reply to the user is not continued unless it announces an action.
  assert.equal(museAnnouncesAction('我是 **muse-wonder-full-1.0**，运行在 DeepSeek Harness 里的编码 Agent。'), false)
  assert.equal(museAnnouncesAction('修好了。'), false)
  assert.equal(museAnnouncesAction('要我现在就开始实现吗？'), false)
  assert.equal(museAnnouncesAction('If you want, I can run the tests next.'), false)
  assert.equal(museAnnouncesAction('已完成，测试全部通过。'), false)
})

test('museMidToolLoop is true only while the newest real input is a tool result', () => {
  const assistant = assistantTurn(undefined)
  const injected = {
    id: MessageId('i1'), role: 'user' as const, content: [{ type: 'text' as const, text: 'Time sampled while preparing turn 2' }],
    source: { kind: 'time-context' as const },
  }
  const typed = { ...USER, id: MessageId('u2') }
  const mid = (messages: unknown[]) => museMidToolLoop(messages as GenerateOptions['messages'])
  assert.equal(mid([]), false)
  assert.equal(mid([USER]), false, 'a fresh user message starts a turn')
  assert.equal(mid([USER, assistant, TOOL_RESULT]), true)
  assert.equal(mid([USER, assistant, TOOL_RESULT, injected]), true, 'context the harness injects does not end the loop')
  assert.equal(mid([USER, assistant, TOOL_RESULT, typed]), false, 'a message the user typed does')
  assert.equal(mid([{ ...USER, source: undefined }, assistant, TOOL_RESULT]), true)
})

test('museMergedUsage keeps the kept response context and adds the other response output', () => {
  const kept = { inputTokens: 5, outputTokens: 3, cacheReadTokens: 60, reasoningTokens: 2 }
  assert.deepEqual(museMergedUsage(kept, { inputTokens: 40, outputTokens: 12, cacheReadTokens: 60 }), {
    inputTokens: 5, outputTokens: 15, cacheReadTokens: 60, reasoningTokens: 2,
  })
  assert.deepEqual(museMergedUsage(undefined, kept), kept)
  assert.deepEqual(museMergedUsage(kept, undefined), kept)
})

const ANNOUNCEMENT_EVENTS = [
  { type: 'response.output_text.delta', item_id: 'msg_1', delta: '现在跑第一档：' },
  { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } },
  { type: 'response.completed', response: { usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 60 }, output_tokens: 12 } } },
]

/** A request that is mid tool loop: the model just got a tool result. */
const MID_LOOP = () => ({
  provider: 'muse', model: 'muse-spark-1.3', tools: TOOLS, sessionId: 's-1',
  messages: [USER, assistantTurn(undefined), TOOL_RESULT],
}) as unknown as GenerateOptions

function continuingAdapter(fetchFn: typeof fetch, extra: { continueDanglingStop?: boolean; warnings?: string[] } = {}): MuseAdapter {
  return new MuseAdapter({
    models: [{ id: 'muse-spark-1.3' }],
    streamIdleTimeoutMs: 1000,
    tokens: memoryTokens({ accessToken: 'LLM|k', refreshToken: 'dca:i', expiresAt: Date.now() + 3_600_000 }),
    discovery: false,
    fetchFn,
    ...extra.continueDanglingStop === undefined ? {} : { continueDanglingStop: extra.continueDanglingStop },
    ...extra.warnings === undefined ? {} : { onWarn: message => extra.warnings?.push(message) },
  })
}

const inputOf = (call: { init: RequestInit | undefined } | undefined) =>
  JSON.parse(String(call?.init?.body)).input as { type: string; role?: string; content?: { type: string; text: string }[] }[]

test('a reply that announces a next step and stops is continued once, as part of the same message', async () => {
  const warnings: string[] = []
  const { calls, fetchFn } = recordingFetch((_url, _init, index) => sse(index === 0 ? ANNOUNCEMENT_EVENTS : TOOL_CALL_EVENTS))
  const chunks = await collect(continuingAdapter(fetchFn, { warnings }).stream(MID_LOOP()))

  assert.equal(calls.length, 2)
  const second = inputOf(calls[1])
  assert.deepEqual(second.slice(-2).map(item => [item.type, item.role, item.content?.[0]?.type]), [
    ['message', 'assistant', 'output_text'],
    ['message', 'user', 'input_text'],
  ])
  assert.equal(second.at(-2)?.content?.[0]?.text, '现在跑第一档：', 'the model sees its own announcement')
  assert.equal(second.at(-1)?.content?.[0]?.text, MUSE_DANGLING_STOP_NOTICE)
  assert.equal(inputOf(calls[0]).some(item => item.content?.some(part => part.text === MUSE_DANGLING_STOP_NOTICE)), false)

  // One assistant message: the announcement, then the call at the next block index.
  assert.deepEqual(chunks.filter(chunk => chunk.type === 'block-start').map(chunk => [chunk.index, chunk.blockType]), [
    [0, 'text'], [1, 'tool-call'],
  ])
  const blockEnds = chunks.filter(chunk => chunk.type === 'block-end')
  assert.deepEqual(blockEnds.map(chunk => chunk.block.type), ['text', 'tool-call'])
  assert.equal(chunks.filter(chunk => chunk.type === 'usage').length, 1)
  assert.equal(chunks.filter(chunk => chunk.type === 'finish').length, 1)
  assert.equal(chunks.at(-1)?.type, 'finish')
  const usage = chunks.find(chunk => chunk.type === 'usage')
  assert.deepEqual(usage?.type === 'usage' ? usage.usage : undefined, { inputTokens: 5, outputTokens: 15 })
  const finish = chunks.at(-1)
  assert.ok(finish?.type === 'finish' && finish.reason.kind === 'tool-calls')
  const replay = finish?.type === 'finish' ? finish.replayState?.response as MuseReplayResponse : undefined
  assert.deepEqual(replay, { kind: 'muse', version: 1, account: 'acct', calls: ['call_1'], reasoning: [REASONING_ITEM] })
  assert.equal(warnings.length, 1)
  assert.match(warnings[0] ?? '', /short text-only reply/)
})

test('a continuation that only answers in text is dropped: the model really was done', async () => {
  const { calls, fetchFn } = recordingFetch((_url, _init, index) => sse(index === 0 ? ANNOUNCEMENT_EVENTS : TEXT_EVENTS))
  const chunks = await collect(continuingAdapter(fetchFn).stream(MID_LOOP()))
  assert.equal(calls.length, 2)
  const text = chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('')
  assert.equal(text, '现在跑第一档：', 'the dropped answer is never shown')
  const finish = chunks.at(-1)
  assert.ok(finish?.type === 'finish' && finish.reason.kind === 'stop' && finish.replayState === undefined)
  const usage = chunks.find(chunk => chunk.type === 'usage')
  assert.deepEqual(usage?.type === 'usage' ? usage.usage : undefined, { inputTokens: 40, cacheReadTokens: 60, outputTokens: 13 })
})

test('an announcement on the first step after the user message is continued too', async () => {
  const { calls, fetchFn } = recordingFetch((_url, _init, index) => sse(index === 0 ? ANNOUNCEMENT_EVENTS : TOOL_CALL_EVENTS))
  const chunks = await collect(continuingAdapter(fetchFn).stream({
    provider: 'muse', model: 'muse-spark-1.3', tools: TOOLS, sessionId: 's-1', messages: [USER],
  } as unknown as GenerateOptions))
  assert.equal(calls.length, 2)
  const second = inputOf(calls[1])
  assert.equal(second.at(-2)?.content?.[0]?.text, '现在跑第一档：')
  assert.equal(second.at(-1)?.content?.[0]?.text, MUSE_DANGLING_STOP_NOTICE)
  const finish = chunks.at(-1)
  assert.ok(finish?.type === 'finish' && finish.reason.kind === 'tool-calls')
})

test('text the continuation writes before its tool call joins the message', async () => {
  const withText = [
    { type: 'response.output_text.delta', item_id: 'msg_2', delta: '开始。' },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_2' } },
    { type: 'response.output_item.added', output_index: 1, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_weather' } },
    { type: 'response.function_call_arguments.delta', item_id: 'fc_1', delta: '{}' },
    { type: 'response.output_item.done', output_index: 1, item: { type: 'function_call', id: 'fc_1', call_id: 'call_1', name: 'get_weather', arguments: '{}' } },
    { type: 'response.completed', response: { usage: { input_tokens: 5, output_tokens: 3 } } },
  ]
  const { fetchFn } = recordingFetch((_url, _init, index) => sse(index === 0 ? ANNOUNCEMENT_EVENTS : withText))
  const chunks = await collect(continuingAdapter(fetchFn).stream(MID_LOOP()))
  assert.deepEqual(chunks.filter(chunk => chunk.type === 'block-start').map(chunk => [chunk.index, chunk.blockType]), [
    [0, 'text'], [1, 'text'], [2, 'tool-call'],
  ])
  const ends = chunks.filter(chunk => chunk.type === 'block-end')
  assert.deepEqual(ends.map(chunk => chunk.index), [0, 1, 2])
})

test('nothing is continued for an answer, a long reply, a complete tool call, or with the option off', async () => {
  const run = async (options: GenerateOptions, events: unknown[], adapterOptions: { continueDanglingStop?: boolean } = {}) => {
    const { calls, fetchFn } = recordingFetch(() => sse(events))
    const chunks = await collect(continuingAdapter(fetchFn, adapterOptions).stream(options))
    return { calls: calls.length, chunks }
  }
  const fresh = { provider: 'muse', model: 'muse-spark-1.3', tools: TOOLS, messages: [USER] } as unknown as GenerateOptions
  assert.equal((await run(fresh, TEXT_EVENTS)).calls, 1, 'a short answer to the user is not a stop')

  const long = [
    { type: 'response.output_text.delta', item_id: 'msg_1', delta: `${'这是一份完整的总结。'.repeat(60)}现在继续：` },
    { type: 'response.output_item.done', output_index: 0, item: { type: 'message', id: 'msg_1' } },
    { type: 'response.completed', response: { usage: { input_tokens: 9, output_tokens: 1 } } },
  ]
  assert.equal((await run(MID_LOOP(), long)).calls, 1, 'long replies are reports')
  assert.equal((await run(MID_LOOP(), TOOL_CALL_EVENTS)).calls, 1, 'a response with a tool call is not an early stop')
  assert.equal((await run(MID_LOOP(), ANNOUNCEMENT_EVENTS, { continueDanglingStop: false })).calls, 1, 'the option switches it off')
  const noTools = { ...MID_LOOP(), tools: undefined } as unknown as GenerateOptions
  assert.equal((await run(noTools, ANNOUNCEMENT_EVENTS)).calls, 1, 'without tools there is nothing to continue with')
  const off = await run(MID_LOOP(), ANNOUNCEMENT_EVENTS, { continueDanglingStop: false })
  assert.equal(off.chunks.at(-1)?.type, 'finish')
})

test('a refused continuation leaves the turn as the model ended it, but a cancellation still propagates', async () => {
  const warnings: string[] = []
  const refused = recordingFetch((_url, _init, index) => index === 0 ? sse(ANNOUNCEMENT_EVENTS) : json({ error: { message: 'bad request' } }, 400))
  const chunks = await collect(continuingAdapter(refused.fetchFn, { warnings }).stream(MID_LOOP()))
  assert.equal(refused.calls.length, 2, 'a 4xx refusal is not retried')
  const finish = chunks.at(-1)
  assert.ok(finish?.type === 'finish' && finish.reason.kind === 'stop')
  assert.equal(chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join(''), '现在跑第一档：')
  assert.ok(warnings.some(message => /continuation .* refused \(HTTP 400\)/.test(message)), warnings.join('\n'))

  const controller = new AbortController()
  const cancelled = recordingFetch(() => sse(ANNOUNCEMENT_EVENTS))
  const aborting = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (cancelled.calls.length >= 1) {
      controller.abort(new Error('user cancelled'))
      return Promise.reject(new DOMException('This operation was aborted', 'AbortError'))
    }
    return cancelled.fetchFn(input, init)
  }) as typeof fetch
  await assert.rejects(
    collect(continuingAdapter(aborting).stream({ ...MID_LOOP(), signal: controller.signal } as unknown as GenerateOptions)),
    (error: Error & { code?: string }) => error.code === 'ABORTED',
  )
})

test('a continuation retries a transient failure instead of ending the turn', async () => {
  // Recorded 2026-10-17: the step's own request needed two transport retries,
  // then the continuation request died the same way and the user had to type
  // "continue" for a tool that had already announced itself.
  const refusedOnce = recordingFetch((_url, _init, index) => {
    if (index === 0) return sse(ANNOUNCEMENT_EVENTS)
    if (index === 1) return json({ error: { message: 'busy' } }, 503)
    return sse(TOOL_CALL_EVENTS)
  })
  const first = await collect(continuingAdapter(refusedOnce.fetchFn).stream(MID_LOOP()))
  assert.equal(refusedOnce.calls.length, 3, 'a 5xx continuation is retried once')
  const finish = first.at(-1)
  assert.ok(finish?.type === 'finish' && finish.reason.kind === 'tool-calls')

  let count = 0
  const cutOnce = ((_input: RequestInfo | URL, _init?: RequestInit) => {
    count += 1
    if (count === 1) return Promise.resolve(sse(ANNOUNCEMENT_EVENTS))
    if (count === 2) return Promise.reject(new TypeError('fetch failed: other side closed'))
    return Promise.resolve(sse(TOOL_CALL_EVENTS))
  }) as typeof fetch
  const second = await collect(continuingAdapter(cutOnce).stream(MID_LOOP()))
  assert.equal(count, 3, 'a transport cut on the continuation is retried')
  const end = second.at(-1)
  assert.ok(end?.type === 'finish' && end.reason.kind === 'tool-calls')
})
