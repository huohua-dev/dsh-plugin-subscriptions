#!/usr/bin/env node
/**
 * Re-extract Muse Code's builtin tool declarations from the installed CLI.
 *
 * Meta's gateway only accepts a subscription-billed key when the request
 * carries Muse Code's builtin `muse` namespace, so `src/providers/muse-builtin-tools.ts`
 * pins the declarations of the CLI release the plugin presents itself as.
 * When Muse Code ships new tools, run this against the updated CLI and replace
 * the `MUSE_BUILTIN_TOOL_NAMESPACE` value with the printed JSON (and bump
 * `MUSE_CLI_VERSION` in `src/providers/muse.ts`).
 *
 * It works by pointing a headless `muse exec` at a local reverse proxy: the
 * catalog request is forwarded to api.meta.ai (so the CLI can resolve a model),
 * and the first `/v1/responses` request is captured and answered with an error
 * before any tokens are spent. Requires a logged-in `muse` CLI and network
 * access to api.meta.ai (honours HTTPS_PROXY; pass --proxy to name one).
 *
 * Usage:
 *   node scripts/extract-muse-builtin-tools.mjs [--proxy http://host:port] [--model ID]
 */

import http from 'node:http'
import { spawn } from 'node:child_process'
import { ProxyAgent } from 'undici'

const argv = process.argv.slice(2)
const flag = (name) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}

const upstream = 'https://api.meta.ai'
const proxy = flag('--proxy') ?? process.env.HTTPS_PROXY ?? process.env.https_proxy
const model = flag('--model')
const dispatcher = proxy === undefined ? undefined : new ProxyAgent(proxy)
const museBin = process.env.MUSE_BIN ?? 'muse'

/** Forward one request to the real API, returning status, content type and body. */
async function forward(req, body) {
  const headers = { ...req.headers }
  delete headers.host
  delete headers['content-length']
  delete headers['accept-encoding']
  const response = await fetch(`${upstream}${req.url}`, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body,
    ...dispatcher === undefined ? {} : { dispatcher },
  })
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/json',
    body: Buffer.from(await response.arrayBuffer()),
  }
}

let captured = false

const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', async () => {
    const body = Buffer.concat(chunks)
    if (req.method === 'POST' && req.url === '/v1/responses') {
      let tools
      try {
        tools = JSON.parse(body.toString('utf8')).tools
      } catch (error) {
        console.error(`captured body is not JSON: ${String(error)}`)
        process.exitCode = 1
      }
      const namespace = Array.isArray(tools) ? tools.find(tool => tool?.type === 'namespace') : undefined
      const subtools = Array.isArray(namespace?.tools) ? namespace.tools : []
      // Muse also sends small side requests through the same endpoint (reminder
      // decisions and the like); only the turn request carries the full set.
      if (subtools.some(tool => tool?.name === 'bash')) {
        captured = true
        process.stdout.write(`${JSON.stringify(namespace, null, 2)}\n`)
        res.writeHead(400, { 'content-type': 'application/json' })
        res.end('{"error":{"type":"invalid_request_error","message":"extraction complete"}}')
        child?.kill('SIGTERM')
        server.close()
        return
      }
    }
    try {
      const forwarded = await forward(req, body)
      res.writeHead(forwarded.status, { 'content-type': forwarded.contentType })
      res.end(forwarded.body)
    } catch (error) {
      console.error(`upstream request failed: ${String(error)}`)
      res.writeHead(502, { 'content-type': 'application/json' })
      res.end('{"error":{"type":"upstream_error"}}')
    }
  })
})

let child
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address()
  const args = ['exec', '--base-url', `http://127.0.0.1:${String(port)}/v1`, '--preset', 'native-basic', ...model === undefined ? [] : ['--model', model], 'extract tool declarations']
  console.error(`muse ${args.join(' ')}`)
  child = spawn(museBin, args, { stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, MUSE_NO_AUTO_UPDATE: '1' } })
  child.on('error', error => { console.error(String(error)); process.exitCode = 1; server.close() })
  child.on('exit', code => {
    if (!captured && process.exitCode === undefined) {
      console.error(`muse exited with ${String(code)} before the turn request was captured`)
      process.exitCode = 1
    }
    server.close()
  })
})
