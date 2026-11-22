/**
 * Manual A/B probe for the Antigravity v1internal endpoint.
 * Reads the stored Antigravity session from the plugin auth store, refreshes
 * it in memory when expired, and sends controlled request variants so one
 * factor at a time can be blamed for an upstream rejection.
 * Never prints tokens or the project id. Usage: node antigravity-probe.mjs [case ...]
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { ProxyAgent, fetch as undiciFetch } from 'undici'
import { ANTIGRAVITY_DEFAULT_CLIENT_ID, ANTIGRAVITY_DEFAULT_CLIENT_SECRET } from '../../lib/providers/antigravity-oauth-client.js'

const AUTH_PATH = `${process.env.HOME}/.dsh/plugins/subscriptions/auth.json`
const DAILY = 'https://daily-cloudcode-pa.googleapis.com'
const PROD = 'https://cloudcode-pa.googleapis.com'

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy
const dispatcher = proxyUrl ? new ProxyAgent(proxyUrl) : undefined
const doFetch = dispatcher ? (u, i) => undiciFetch(u, { ...i, dispatcher }) : (u, i) => fetch(u, i)

function loadSession(slot = 0) {
  const auth = JSON.parse(readFileSync(AUTH_PATH, 'utf8'))
  const entry = auth.antigravity
  const keys = Object.keys(entry.accounts)
  const key = slot === 0 ? (entry.default ?? keys[0]) : keys[slot]
  return { ...entry.accounts[key] }
}

async function refresh(session) {
  if (session.expiresAt > Date.now() + 60_000) return session
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: session.refreshToken,
    client_id: ANTIGRAVITY_DEFAULT_CLIENT_ID,
    client_secret: ANTIGRAVITY_DEFAULT_CLIENT_SECRET,
  })
  const res = await doFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`token refresh failed HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const tokens = await res.json()
  return { ...session, accessToken: tokens.access_token, expiresAt: Date.now() + tokens.expires_in * 1000 }
}

function ua(version = '2.23.0') {
  const os = process.platform === 'win32' ? 'windows' : process.platform
  const cpu = process.arch === 'x64' ? 'amd64' : process.arch
  return `antigravity/hub/${version} ${os}/${cpu}`
}

/** Envelope mirroring src/translate/antigravity.ts toAntigravityRequest. */
function envelope(session, { model, system, tools, thinkingLevel, maxOutputTokens = 2048, sessionId, userText = 'Reply with exactly: OK', requestIdSuffix = '4', extra = {} }) {
  return {
    project: session.projectId,
    requestId: `agent/${String(Date.now())}/${randomUUID()}/${requestIdSuffix}`,
    model,
    userAgent: 'antigravity',
    requestType: 'agent',
    ...extra,
    request: {
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      sessionId: sessionId ?? randomUUID(),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      ...(tools?.length ? {
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: 'VALIDATED' } },
      } : {}),
      generationConfig: {
        maxOutputTokens,
        ...(thinkingLevel ? { thinkingConfig: { includeThoughts: true, thinkingLevel } } : {}),
      },
    },
  }
}

function officialUa() {
  const os = process.platform === 'win32' ? 'windows' : process.platform
  const arch = process.arch === 'x64' ? 'amd64' : process.arch
  return `antigravity/hub/2.34.0 (aidev_client; os_type=${os}; arch=${arch}; cl=1026637980)`
}

/** FNV-1a 64-bit -> signed int64 decimal string, mirroring LS getSessionID. */
function fnvSessionId(input) {
  let hash = 0xcbf29ce484222325n
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte)
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn
  }
  return BigInt.asIntN(64, hash).toString()
}

async function send(label, session, payload, { base = DAILY, version = '2.23.0', stream = true, uaOverride, extraHeaders = {}, noAccept = false } = {}) {
  const method = stream ? 'streamGenerateContent?alt=sse' : 'generateContent'
  const started = Date.now()
  try {
    const res = await doFetch(`${base}/v1internal:${method}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        'content-type': 'application/json',
        'user-agent': uaOverride ?? ua(version),
        ...(noAccept ? {} : { accept: stream ? 'text/event-stream' : 'application/json' }),
        ...extraHeaders,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    })
    const text = await res.text()
    const head = text.slice(0, 500).replace(/\s+/g, ' ')
    console.log(`[${label}] HTTP ${res.status} ${Date.now() - started}ms model=${payload.model}`)
    console.log(`  body: ${head}`)
    return res.status
  } catch (error) {
    console.log(`[${label}] FETCH-FAILED ${Date.now() - started}ms: ${error.message} cause=${error.cause?.message ?? ''}`)
    return 0
  }
}

const simpleTool = { name: 'get_weather', description: 'Get weather for a city', parametersJsonSchema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } }

const cases = {
  'low-min': s => send('low-min', s, envelope(s, { model: 'gemini-3.8-flash-low', thinkingLevel: 'LOW' })),
  'med-min': s => send('med-min', s, envelope(s, { model: 'gemini-3.8-flash-medium', thinkingLevel: 'MEDIUM' })),
  'high-min': s => send('high-min', s, envelope(s, { model: 'gemini-3.8-flash-high', thinkingLevel: 'HIGH' })),
  'high-min-nostream': s => send('high-min-nostream', s, envelope(s, { model: 'gemini-3.8-flash-high', thinkingLevel: 'HIGH' }), { stream: false }),
  'high-min-prod': s => send('high-min-prod', s, envelope(s, { model: 'gemini-3.8-flash-high', thinkingLevel: 'HIGH' }), { base: PROD }),
  'high-ua234': s => send('high-ua234', s, envelope(s, { model: 'gemini-3.8-flash-high', thinkingLevel: 'HIGH' }), { version: '2.34.0' }),
  'high-system': s => send('high-system', s, envelope(s, { model: 'gemini-3.8-flash-high', thinkingLevel: 'HIGH', system: 'You are a helpful coding agent inside an IDE. Answer concisely.' })),
  'high-tool1': s => send('high-tool1', s, envelope(s, { model: 'gemini-3.8-flash-high', thinkingLevel: 'HIGH', tools: [simpleTool] })),
  'tiered-min': s => send('tiered-min', s, envelope(s, { model: 'gemini-3.8-flash-tiered' })),
  'quota': async s => {
    const res = await doFetch(`${DAILY}/v1internal:retrieveUserQuotaSummary`, {
      method: 'POST',
      headers: { authorization: `Bearer ${s.accessToken}`, 'content-type': 'application/json', 'user-agent': ua() },
      body: JSON.stringify({ project: s.projectId }),
    })
    console.log(`[quota] HTTP ${res.status}: ${(await res.text()).slice(0, 900).replace(/\s+/g, ' ')}`)
  },
  'models': async s => {
    const res = await doFetch(`${DAILY}/v1internal:fetchAvailableModels`, {
      method: 'POST',
      headers: { authorization: `Bearer ${s.accessToken}`, 'content-type': 'application/json', 'user-agent': ua() },
      body: JSON.stringify({ project: s.projectId }),
    })
    const text = await res.text()
    console.log(`[models] HTTP ${res.status}`)
    if (res.ok) {
      const models = JSON.parse(text).models ?? {}
      for (const [id, m] of Object.entries(models)) {
        if (/flash|argon/i.test(id)) console.log(`  ${id}: quota=${JSON.stringify(m.quotaInfo ?? null)} weekly=${JSON.stringify(m.weeklyQuotaInfo ?? m.weeklyQuota ?? null)} disabled=${m.disabled ?? false}`)
      }
    } else console.log(`  body: ${text.slice(0, 400).replace(/\s+/g, ' ')}`)
  },
  'high-dsh': s => {
    const tools = Array.from({ length: 79 }, (_, i) => ({
      name: ['bash', 'read_file', 'write_file', 'search', 'web_search', 'todo_write'][i % 6] + (i >= 6 ? `_${i}` : ''),
      description: 'Execute a tool. '.repeat(12),
      parametersJsonSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'The input text. '.repeat(6) },
          mode: { type: 'string', enum: ['a', 'b', 'c'] },
          opts: { type: 'object', properties: { deep: { type: 'boolean' } }, additionalProperties: false },
        },
        required: ['input'],
        additionalProperties: false,
      },
    }))
    const system = ('You are an agent running in DeepSeek Harness. Use the provided tools to complete tasks. ' +
      'Follow the workspace instructions and report progress. ').repeat(160)
    return send('high-dsh', s, envelope(s, {
      model: 'gemini-3.8-flash-high', thinkingLevel: 'HIGH', system, tools,
      sessionId: 'session-e5ac0a30-4713-4330-8196-25a363245efb',
      maxOutputTokens: 32768,
    }))
  },
}

cases['refresh-test'] = async s => {
    const res = await doFetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refreshToken, client_id: ANTIGRAVITY_DEFAULT_CLIENT_ID, client_secret: ANTIGRAVITY_DEFAULT_CLIENT_SECRET }).toString(),
    })
    const text = await res.text()
    console.log(`[refresh-test] HTTP ${res.status}: ${res.ok ? 'token refreshed OK (bundled secret accepted)' : text.slice(0, 240)}`)
  }
  cases['models-newua'] = async s => {
    const res = await doFetch(`${DAILY}/v1internal:fetchAvailableModels`, {
      method: 'POST',
      headers: { authorization: `Bearer ${s.accessToken}`, 'content-type': 'application/json', 'user-agent': officialUa() },
      body: JSON.stringify({ project: s.projectId }),
    })
    const text = await res.text()
    if (!res.ok) { console.log(`[models-newua] HTTP ${res.status}: ${text.slice(0, 300)}`); return }
    const ids = Object.keys(JSON.parse(text).models ?? {})
    console.log(`[models-newua] HTTP 200 models=${ids.length} flash38=${ids.filter(i => i.startsWith('gemini-3.8-flash')).join(',')}`)
  }
  cases['high-official'] = s => send('high-official', s, envelope(s, {
    model: 'gemini-3.8-flash-high', thinkingLevel: 'HIGH',
    sessionId: fnvSessionId('session-e5ac0a30-4713-4330-8196-25a363245efb'),
  }), { uaOverride: officialUa(), noAccept: true })

const wanted = process.argv.slice(2)
const names = wanted.length ? wanted : ['low-min', 'high-min']
let session = await refresh(loadSession(Number(process.env.PROBE_SLOT ?? 0)))
console.log(`account slot: ${process.env.PROBE_SLOT ?? 0}`)
console.log(`proxy: ${proxyUrl ? 'env' : 'direct'} | token expires in ${Math.round((session.expiresAt - Date.now()) / 1000)}s`)
for (const name of names) {
  if (!cases[name]) { console.log(`unknown case ${name}; known: ${Object.keys(cases).join(', ')}`); continue }
  await cases[name](session)
}
