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
  MuseAdapter,
  completeMuseLogin,
  fetchMuseModels,
  isMusePermanentRefreshError,
  museDeviceFlow,
  museHeaders,
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
