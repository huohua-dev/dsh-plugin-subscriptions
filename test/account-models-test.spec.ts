/**
 * The per-account "test model fetch" probe: one live model-list request per
 * account, through that account's own proxy, answering with what came back
 * instead of degrading to a cached catalog.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import type { LlmModelInfo } from '@deepseek-ai/dsh-llm'
import type { AccountModelsTestResult } from '../src/auth/rpc.js'
import { CodexAdapter } from '../src/providers/codex.js'
import { saveAccountSession } from '../src/auth/store.js'
import * as plugin from '../src/index.js'
import { createFakeConnection } from './fake-connection.js'

test('each account probes its own model list through its own proxy, draft or saved', async () => {
  const home = await mkdtemp(join(tmpdir(), 'account-probe-rpc-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const ctx = new Context()
  const llm = new LlmRuntime(ctx)
  const connection = createFakeConnection()
  ctx.provide('connection', connection.connection)
  ctx.provide('tools', { register: () => () => {} })

  const calls: [string, string, boolean][] = []
  const original = CodexAdapter.prototype.probeOwnModels
  let failure: string | undefined
  CodexAdapter.prototype.probeOwnModels = async function (provider: string, account: string, signal?: AbortSignal) {
    calls.push([provider, account, signal !== undefined])
    if (failure !== undefined) throw new Error(failure)
    return ['m1', 'm2'].map(id => ({ provider, id, name: id.toUpperCase(), inputModalities: ['text'] }) as LlmModelInfo)
  }
  const runtime = ctx.plugin(plugin, {
    providers: ['codex'], pool: { enabled: false },
    models: { codex: [{ id: 'm1', name: 'Model 1', inputModalities: ['text'] }] },
  })
  try {
    await new Promise(resolve => setTimeout(resolve, 50))
    assert.ok(connection.registered())
    for (const account of ['personal', 'work']) {
      await saveAccountSession('codex', account, {
        accessToken: 'token', refreshToken: 'refresh', expiresAt: Date.now() + 3600_000, accountId: account, idToken: '',
      })
    }
    const call = (payload: unknown, endpoint = 'accountModelsTest') =>
      connection.handler(endpoint, payload, new AbortController().signal)
    const probe = async (payload: unknown): Promise<AccountModelsTestResult> => {
      const result = await call(payload)
      assert.ok(result.ok, result.ok ? '' : JSON.stringify(result.error))
      return result.value as AccountModelsTestResult
    }

    // One account, one live fetch: the probe asks the adapter directly, never
    // the cached catalog listOwnModels would answer from.
    const first = await probe({ provider: 'codex', account: 'work', proxy: '' })
    assert.deepEqual(first.models, ['m1', 'm2'])
    assert.equal(first.ok, true)
    assert.equal(first.viaProxy, false, 'a blank proxy field means no account proxy')
    assert.equal(typeof first.latencyMs, 'number')
    assert.equal(first.error, undefined)
    assert.deepEqual(calls.at(-1)?.slice(0, 2), ['codex', 'work'])

    // Another account is probed on its own, and gets its own answer.
    const other = await probe({ provider: 'codex', account: 'personal', proxy: '' })
    assert.deepEqual(other.models, ['m1', 'm2'])
    assert.deepEqual(calls.at(-1)?.slice(0, 2), ['codex', 'personal'])
    assert.ok((calls.at(-1)?.[2] ?? false), 'the probe runs under a deadline and the caller signal')

    // A saved account proxy is the route the probe reports when the field is absent.
    assert.equal((await call({
      provider: 'codex', settings: { accounts: { work: { proxy: 'socks5://proxy.example:1080' } } },
    }, 'setProviderSettings')).ok, true)
    assert.equal((await probe({ provider: 'codex', account: 'work' })).viaProxy, true)
    // The card's field wins over the stored one: blank here means no proxy.
    assert.equal((await probe({ provider: 'codex', account: 'work', proxy: '' })).viaProxy, false)
    // A typed-but-unsaved URL is used for the probe only.
    assert.equal((await probe({ provider: 'codex', account: 'work', proxy: 'socks5://typed.example:1080' })).viaProxy, true)
    assert.equal((await probe({ provider: 'codex', account: 'personal' })).viaProxy, false, 'proxies are per account')

    // A failed fetch is an answer, not an exception: the card shows the reason.
    failure = 'fetch failed → connect ECONNREFUSED 127.0.0.1:1080'
    const failed = await probe({ provider: 'codex', account: 'work', proxy: '' })
    assert.equal(failed.ok, false)
    assert.deepEqual(failed.models, [])
    assert.match(failed.error ?? '', /ECONNREFUSED/)
    assert.equal(failed.viaProxy, false)

    // Bad payloads stay client errors.
    failure = undefined
    assert.equal((await call({ provider: 'codex' })).ok, false)
    assert.equal((await call({ provider: 'codex', account: '' })).ok, false)
    assert.equal((await call({ provider: 'codex', account: 'work', proxy: 7 })).ok, false)
    assert.equal((await call({ provider: 'nope', account: 'work' })).ok, false)
    assert.equal((await call({ provider: 'claude', account: 'work' })).ok, false, 'an unmounted provider cannot be probed')
  } finally {
    await runtime.dispose()
    CodexAdapter.prototype.probeOwnModels = original
    if (previous === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
})