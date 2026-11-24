import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MessageId } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, ReplayEnvelope, StreamChunk } from '@deepseek-ai/dsh-llm'
import { streamAccountWithReplay, type RequestEnd } from '../src/providers/replay.js'
import { requestCounts } from '../src/usage/request-counts.js'
import { observeUsageFetchers, type UsageFetchers } from '../src/usage/snapshot-hook.js'

const opts: GenerateOptions = { provider: 'codex', model: 'model-alias', messages: [] }
const chunk = (outputTokens: number): StreamChunk => ({
  type: 'usage', usage: { inputTokens: 11, outputTokens, totalTokens: 11 + outputTokens + 5, cacheReadTokens: 5 },
})

test('account capture receives the final token chunk once and does not affect a failed stream', async () => {
  const ended: RequestEnd[] = []
  const failure = new Error('synthetic provider failure')
  const adapter = {
    async *streamAccount() {
      yield chunk(1)
      yield chunk(3)
      throw failure
    },
  }
  await assert.rejects(async () => {
    for await (const _ of streamAccountWithReplay(adapter, opts, 'acct', 'actual-model', end => {
      ended.push(end)
      throw new Error('synthetic observer failure')
    })) { /* drain */ }
  }, error => error === failure)
  assert.equal(ended.length, 1)
  assert.equal(ended[0]?.account, 'acct')
  assert.equal(ended[0]?.model, 'actual-model')
  assert.deepEqual(requestCounts(ended[0]!.chunk), {
    inputTokens: 11, outputTokens: 3, cacheReadTokens: 5, cacheWriteTokens: 0, reasoningTokens: 0,
  })
})

test('signed Claude replay must carry a matching account envelope', async () => {
  const response = { kind: 'anthropic', version: 2 }
  const original: ReplayEnvelope = { response, blocks: [] }
  const options = { ...opts, provider: 'claude' }
  let wrapped: ReplayEnvelope | undefined
  const producer = { async *streamAccount(): AsyncIterable<StreamChunk> {
    yield { type: 'finish', reason: { kind: 'stop' }, replayState: original }
  } }
  for await (const event of streamAccountWithReplay(producer, options, 'first')) {
    if (event.type === 'finish') wrapped = event.replayState
  }
  assert.ok(wrapped)
  const inspect = async (replayState: ReplayEnvelope, account: string) => {
    const history: GenerateOptions['messages'] = [{
      id: MessageId('assistant-replay'), role: 'assistant', content: [],
      source: { kind: 'model', provider: 'claude', model: options.model, replayState },
    }]
    let seen: unknown
    const consumer = { async *streamAccount(next: GenerateOptions): AsyncIterable<StreamChunk> {
      const agent = next.messages[0]
      if (agent?.role === 'assistant') seen = agent.source?.replayState
    } }
    for await (const _ of streamAccountWithReplay(consumer, { ...options, messages: history }, account)) { /* drain */ }
    return seen
  }
  assert.deepEqual(await inspect(wrapped, 'first'), original)
  assert.equal(await inspect(wrapped, 'second'), undefined)
  assert.equal(await inspect(original, 'first'), undefined)
})

test('quota capture reports successful fetches but adds no extra fetch or failure', async () => {
  let fetched = 0
  const seen: unknown[][] = []
  const snapshot = { supported: true } as const
  const rejected = new Error('synthetic rejected lookup')
  const fetchers: UsageFetchers = { codex: async account => {
    fetched += 1
    if (account === 'failed') throw rejected
    return snapshot
  } }
  observeUsageFetchers(fetchers, (...args) => seen.push(args), undefined, () => 123)
  const signal = new AbortController().signal
  assert.equal(await fetchers.codex!('acct', signal), snapshot)
  await assert.rejects(() => fetchers.codex!('failed', signal), error => error === rejected)
  assert.equal(fetched, 2)
  assert.deepEqual(seen, [['codex', 'acct', snapshot, 123]])
})
