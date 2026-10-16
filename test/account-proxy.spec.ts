/**
 * Per-account proxies: validation, SOCKS5 tunnelling, and the async-context
 * scope that carries the serving account into `proxiedFetch`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, connect } from 'node:net'
import { createServer as createHttpServer } from 'node:http'
import type { AddressInfo, Server, Socket } from 'node:net'
import { LlmAdapter } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmModelInfo, LlmResolvedModelInfo, StreamChunk } from '@deepseek-ai/dsh-llm'
import {
  parseProxyUrl,
  proxiedFetch,
  resetProxyForTests,
  runAccountProxyProbe,
  runWithAccountProxy,
  setAccountProxyResolver,
  withAccountProxy,
} from '../src/http.js'
import { withAccountProxyScope } from '../src/providers/account-proxy.js'
import { ProviderSettingsStore, validatePreferences } from '../src/provider-settings.js'

/** A no-auth SOCKS5 tunnel server, enough to prove undici really tunnels. */
async function startSocks5Server(): Promise<{ url: string; tunnels: () => string[]; close: () => Promise<void> }> {
  const tunnels: string[] = []
  const relays = new Set<Socket>()
  const server: Server = createServer(socket => {
    let buffer = Buffer.alloc(0)
    let greeted = false
    const relay = (up: Socket, down: Socket): void => { up.pipe(down); down.pipe(up); relays.add(up); relays.add(down) }
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk])
      // Greeting: VER, NMETHODS, METHODS[]. Answer NO_AUTH once it is complete.
      if (!greeted) {
        if (buffer.length < 2) return
        if (buffer[0] !== 0x05) { socket.destroy(); return }
        const methods = buffer[1]
        if (buffer.length < 2 + methods) return
        buffer = buffer.subarray(2 + methods)
        greeted = true
        socket.write(Buffer.from([0x05, 0x00]))
      }
      // CONNECT: VER, CMD, RSV, ATYP, DST.ADDR, DST.PORT
      if (buffer.length < 5 || buffer[0] !== 0x05 || buffer[1] !== 0x01) return
      const type = buffer[3]
      const host = type === 0x01
        ? Array.from(buffer.subarray(4, 8)).join('.')
        : type === 0x03
          ? buffer.subarray(5, 5 + buffer[4]).toString()
          : undefined
      const portAt = type === 0x01 ? 8 : type === 0x03 ? 5 + buffer[4] : -1
      if (host === undefined || buffer.length < portAt + 2) return
      const port = buffer.readUInt16BE(portAt)
      buffer = buffer.subarray(portAt + 2)
      socket.removeListener('data', onData)
      const target = connect({ host, port }, () => {
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
        tunnels.push(`${host}:${port}`)
        relay(socket, target)
      })
      target.on('error', () => socket.destroy())
      socket.on('error', () => target.destroy())
    }
    socket.on('data', onData)
    socket.on('error', () => undefined)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `socks5://127.0.0.1:${(server.address() as AddressInfo).port}`,
    tunnels: () => [...tunnels],
    close: async () => {
      for (const socket of relays) socket.destroy()
      await new Promise<void>(resolve => server.close(() => resolve()))
    },
  }
}

/** A plain HTTP origin, reachable directly and through the tunnel. */
async function startOrigin(body = 'origin'): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createHttpServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' })
    response.end(body)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/models`,
    close: () => new Promise<void>(resolve => {
      // undici keeps the tunneled sockets alive; drop them or close() waits.
      server.closeAllConnections()
      server.close(() => resolve())
    }),
  }
}

/** Streams through one account, fetching before and after a yield. */
class Probe extends LlmAdapter {
  constructor(private readonly origin: string) { super() }
  override async *stream(): AsyncIterable<StreamChunk> { throw new Error('unscoped route must not be used') }
  async *streamAccount(_options: GenerateOptions, account: string): AsyncIterable<StreamChunk> {
    const body = await (await proxiedFetch(this.origin)).text()
    yield { type: 'text-delta', index: 0, text: `${account}:${body}` }
    // The second fetch runs after the consumer came back for more: the scope
    // must survive that round trip, which is the whole reason for the wrapper.
    yield { type: 'text-delta', index: 0, text: await (await proxiedFetch(this.origin)).text() }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  async listOwnModels(): Promise<readonly LlmModelInfo[]> { return [] }
  async resolveOwnModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    return { provider, id: model, name: model }
  }
  clearAccountCatalog(): void {}
}

const options: GenerateOptions = { provider: 'codex', model: 'gpt-test', messages: [] }
async function text(stream: AsyncIterable<StreamChunk>): Promise<string> {
  let out = ''
  for await (const chunk of stream) if (chunk.type === 'text-delta') out += chunk.text
  return out
}

test('an account proxy accepts SOCKS5 and HTTP URLs, persists and clears', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'account-proxy-settings-'))
  try {
    const store = new ProviderSettingsStore(join(dir, 'settings.json'))
    await store.set('codex', { accounts: { work: { proxy: '  socks5://user:pass@proxy.example:1080  ' }, play: {} } })
    assert.equal(store.accountProxy('codex', 'work'), 'socks5://user:pass@proxy.example:1080')
    assert.equal(store.accountProxy('codex', 'play'), undefined)
    assert.equal(store.accountProxy('grok', 'work'), undefined, 'proxies are per subscription')
    assert.equal(new ProviderSettingsStore(store.path).accountProxy('codex', 'work'), 'socks5://user:pass@proxy.example:1080')
    await store.set('codex', { accounts: { work: { proxy: '   ' } } })
    assert.equal(store.accountProxy('codex', 'work'), undefined, 'a blank field clears the proxy')
    for (const url of ['socks5://proxy.example:1080', 'socks5h://u:p@proxy.example', 'http://proxy.example:8080', 'https://proxy.example:8443']) {
      assert.equal(validatePreferences('codex', { accounts: { a: { proxy: url } } }).accounts?.a?.proxy, url)
    }
    for (const url of ['proxy.example:1080', 'ftp://proxy.example', 'socks4://proxy.example', 'socks5://', 7, {}]) {
      assert.throws(() => validatePreferences('codex', { accounts: { a: { proxy: url } } }), /account proxy/, `rejects ${JSON.stringify(url)}`)
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('proxy URLs accept SOCKS5 and HTTP, and reject schemes undici cannot speak', () => {
  assert.equal(parseProxyUrl('socks5://user:pass@proxy.example:1080').protocol, 'socks5:')
  assert.equal(parseProxyUrl('socks5h://proxy.example').protocol, 'socks5h:')
  assert.equal(parseProxyUrl('http://proxy.example:8080').hostname, 'proxy.example')
  for (const url of ['socks4://proxy.example:1080', 'proxy.example:1080', 'https://']) {
    assert.throws(() => parseProxyUrl(url), /proxy URL/, `rejects ${url}`)
  }
})

test('an account stream leaves through its own SOCKS5 proxy while another account stays direct', async () => {
  const socks = await startSocks5Server()
  const origin = await startOrigin()
  const previousHome = process.env.DSH_HOME
  const dir = await mkdtemp(join(tmpdir(), 'account-proxy-home-'))
  process.env.DSH_HOME = dir
  await resetProxyForTests()
  try {
    setAccountProxyResolver((_provider, account) => (account === 'tunnel' ? socks.url : undefined))
    const adapter = withAccountProxyScope('codex', new Probe(origin.url))
    assert.equal(await text(adapter.streamAccount(options, 'tunnel')), `tunnel:originorigin`)
    assert.equal(socks.tunnels().length, 2, 'both requests crossed the tunnel')
    assert.match(socks.tunnels()[0] ?? '', /^127\.0\.0\.1:\d+$/, 'the tunnel carried the origin host and port')
    assert.equal(await text(adapter.streamAccount(options, 'direct')), 'direct:originorigin')
    assert.equal(socks.tunnels().length, 2, 'an account without a proxy never touches it')
    assert.equal(await (await proxiedFetch(origin.url)).text(), 'origin', 'unscoped requests keep plugin-wide routing')
  } finally {
    await resetProxyForTests()
    await socks.close()
    await origin.close()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(dir, { recursive: true, force: true })
  }
})

test('a broken or unbuildable account proxy fails loudly instead of leaking direct traffic', async () => {
  const socks = await startSocks5Server()
  const origin = await startOrigin()
  await socks.close()
  await resetProxyForTests()
  try {
    // A proxy that cannot be dialled or built must not silently fall back to
    // the host route: the account asked for a tunnel, so the request fails.
    setAccountProxyResolver((_provider, account) => (account === 'tunnel' ? socks.url : undefined))
    const adapter = withAccountProxyScope('codex', new Probe(origin.url))
    await assert.rejects(() => text(adapter.streamAccount(options, 'tunnel')))
    assert.equal(await text(adapter.streamAccount(options, 'direct')), 'direct:originorigin')
    setAccountProxyResolver(() => 'ftp://proxy.example')
    await assert.rejects(() => text(adapter.streamAccount(options, 'tunnel')), /scheme/)
    setAccountProxyResolver(() => 'http://127.0.0.1:1')
    await assert.rejects(() => runWithAccountProxy({ provider: 'codex', account: 'a' }, () => proxiedFetch(origin.url)))
    assert.equal(await (await proxiedFetch(origin.url)).text(), 'origin', 'unscoped requests still reach the origin')
  } finally {
    await resetProxyForTests()
    await origin.close()
  }
})

test('the Settings probe uses the proxy it is handed, saved or still a draft', async () => {
  const socks = await startSocks5Server()
  const origin = await startOrigin()
  const previousHome = process.env.DSH_HOME
  const dir = await mkdtemp(join(tmpdir(), 'account-proxy-probe-'))
  process.env.DSH_HOME = dir
  await resetProxyForTests()
  const route = { provider: 'codex', account: 'work' }
  const fetchOrigin = () => proxiedFetch(origin.url).then(response => response.text())
  try {
    setAccountProxyResolver((_provider, account) => (account === 'work' ? socks.url : undefined))
    // No draft: the account's saved proxy answers, exactly like a real request.
    assert.deepEqual(await runAccountProxyProbe(route, undefined, fetchOrigin), {
      ok: true, viaProxy: true, value: 'origin',
    })
    assert.equal(socks.tunnels().length, 1)

    // A blank field means NO account proxy even though one is saved: the probe
    // reports the card as typed, not the stored setting.
    assert.deepEqual(await runAccountProxyProbe(route, '   ', fetchOrigin), {
      ok: true, viaProxy: false, value: 'origin',
    })
    assert.equal(socks.tunnels().length, 1, 'a blank probe never touches the saved proxy')

    // An unsaved URL is the whole point: it tunnels now, and the account's own
    // dispatcher cache is untouched, so live routing still uses the saved one.
    assert.deepEqual(await runAccountProxyProbe(route, ` ${socks.url} `, fetchOrigin), {
      ok: true, viaProxy: true, value: 'origin',
    })
    assert.equal(socks.tunnels().length, 2, 'the draft URL carried the probe')
    assert.deepEqual(await runAccountProxyProbe(route, undefined, fetchOrigin), {
      ok: true, viaProxy: true, value: 'origin',
    })
    assert.equal(await runWithAccountProxy(route, fetchOrigin), 'origin', 'live traffic kept the saved proxy')

    // An unusable URL is a config problem: it fails before a request is sent.
    const before = socks.tunnels().length
    const unusable = await runAccountProxyProbe(route, 'ftp://proxy.example', fetchOrigin)
    assert.equal(unusable.ok, false)
    assert.equal(unusable.viaProxy, false)
    assert.match(unusable.error ?? '', /scheme/)
    assert.equal(socks.tunnels().length, before)

    // An unreachable proxy fails the probe instead of silently going direct.
    const dead = await runAccountProxyProbe(route, 'http://127.0.0.1:1', fetchOrigin)
    assert.equal(dead.ok, false)
    assert.equal(dead.viaProxy, true, 'the probe asked for a proxy, and did get one')
    assert.equal(socks.tunnels().length, before, 'the failed probe reached no tunnel')
    assert.equal(await fetchOrigin(), 'origin', 'and host routing still works')

    // An account with no saved proxy reports host routing for both drafts.
    setAccountProxyResolver(() => undefined)
    assert.deepEqual(await runAccountProxyProbe(route, undefined, fetchOrigin), {
      ok: true, viaProxy: false, value: 'origin',
    })
  } finally {
    await resetProxyForTests()
    await socks.close()
    await origin.close()
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(dir, { recursive: true, force: true })
  }
})

test('a closing account stream releases the tunnel request it was serving', async () => {
  const socks = await startSocks5Server()
  const origin = await startOrigin()
  await resetProxyForTests()
  try {
    setAccountProxyResolver(() => socks.url)
    const chunks: string[] = []
    await assert.rejects(async () => {
      for await (const chunk of withAccountProxy({ provider: 'codex', account: 'tunnel' }, (async function* () {
        yield await (await proxiedFetch(origin.url)).text()
        throw new Error('consumer gave up')
      })())) chunks.push(chunk)
    }, /consumer gave up/)
    assert.deepEqual(chunks, ['origin'], 'the scoped fetch ran before the stream gave up')
    assert.equal(socks.tunnels().length, 1)
  } finally {
    await resetProxyForTests()
    await socks.close()
    await origin.close()
  }
})