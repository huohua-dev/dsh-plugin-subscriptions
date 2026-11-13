// Page half of test/client-bundle-browser.mjs: stands in for the DSH web shell.
// It owns the module table the shipped bundle's `require` is answered from, a
// recording ctx for `apply()`, and a composer dock shaped like the host's
// (a centered flex row of pills under the card). The plugin bundle itself is
// loaded unmodified from lib/client.js, exactly as the host would serve it.
import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as jsxRuntime from 'react/jsx-runtime'
import { hostPrimitivesExports } from './fixtures/host-primitives-exports.js'

type Component = (props: Record<string, unknown>) => React.ReactNode
interface Registration {
  def: { name: string; id?: string; key?: string; inject?: (sessionId: string) => Record<string, unknown> }
  Component: Component
}

const scope = globalThis as unknown as Record<string, unknown> & {
  __ModuleLoader__?: unknown
  __LOADED__?: { id: string; factory: (require: (name: string) => unknown) => Record<string, unknown> }
}

// Module table: the packages the bundle may `require`. Anything else throws, as
// the host's loader does for a specifier outside its frozen table.
const Glyph = () => <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><circle cx="7" cy="7" r="5" fill="currentColor" /></svg>
const primitivesNamespace: Record<string, unknown> = Object.create(null)
for (const name of hostPrimitivesExports) primitivesNamespace[name] = name.startsWith('Icon') ? Glyph : () => null
if ('useAnchoredPosition' in primitivesNamespace) throw new Error('the stand-in must model a host without useAnchoredPosition')
const primitivesReads = new Set<string | symbol>()
const primitives = new Proxy(primitivesNamespace, {
  get(target, key, receiver) {
    primitivesReads.add(key)
    return Reflect.get(target, key, receiver) as unknown
  },
})
const requested: string[] = []
const table: Record<string, unknown> = {
  react: React,
  'react-dom': ReactDOM,
  'react/jsx-runtime': jsxRuntime,
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
}

scope.__ModuleLoader__ = { load(def: NonNullable<typeof scope.__LOADED__>) { scope.__LOADED__ = def } }

const ok = (value: unknown) => ({ ok: true, value })
const now = Date.now()
const rpc = {
  call: async (_channel: string, method: string, payload: { provider?: string }) => {
    if (method.endsWith('.status')) {
      const empty = { busy: false, accounts: [] }
      return ok({ providers: {
        codex: { busy: false, accounts: [{ key: 'codex-test', isDefault: true, account: 'me@example.com', plan: 'pro' }] },
        claude: empty, grok: empty, copilot: empty, antigravity: empty, muse: empty,
      } })
    }
    if (method.endsWith('.usage')) {
      return ok({
        supported: true, fetchedAt: now - 1000, staleAt: now + 299_000,
        windows: payload.provider !== 'codex' ? [] : [
          { kind: 'session', usedPercent: 28, resetsAt: now + 3 * 3_600_000 },
          { kind: 'weekly', usedPercent: 41, resetsAt: now + 4 * 86_400_000 },
          ...['gpt-test', 'gpt-a', 'gpt-b', 'gpt-c', 'gpt-d'].map((scope, i) => ({ kind: 'weekly', scope, usedPercent: 5 + i })),
        ],
      })
    }
    if (method.endsWith('.speed')) return ok({ tier: 'standard', fastModels: ['gpt-test'] })
    throw new Error(`Unexpected RPC: ${method}`)
  },
}
const connection = { rpc }
const modelDirectories = {
  directoryFor: () => ({ load: async () => ({ current: { provider: 'codex', model: 'gpt-test' } }) }),
}

const registrations: Registration[] = []
const dictionaries: Record<string, Record<string, Record<string, string>>> = {}
const commands: string[] = []
const services: Record<string, unknown> = {
  connection,
  modelDirectories,
  commandUi: { register: (command: { name: string }) => { commands.push(command.name); return () => {} } },
}
const ctx = {
  effect: (fn: () => unknown) => fn(),
  get: (name: string) => services[name],
  inject: (_names: string[], callback: (scoped: unknown) => void) => { callback(ctx) },
  locale: {
    register: (namespace: string, value: Record<string, Record<string, string>>) => { dictionaries[namespace] = value; return () => {} },
    bind: (namespace: string) => (key: string, params?: Record<string, unknown>) =>
      (dictionaries[namespace]?.en?.[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? '')),
  },
  slots: {
    register: (def: Registration['def'], Component: Component): Registration => ({ def, Component }),
    inject: (_key: string, callback: () => Registration | Iterable<Registration>) => {
      const result = callback()
      const list = Symbol.iterator in Object(result) ? [...result as Iterable<Registration>] : [result as Registration]
      registrations.push(...list)
    },
  },
}

function Dock({ sessionId }: { sessionId: string }) {
  const entry = (name: string, id: string) => {
    const found = registrations.find(item => item.def.name === name && item.def.id === id)
    if (found === undefined) throw new Error(`no ${name}/${id} registration`)
    const t = ctx.locale.bind('settings.subscriptions')
    return React.createElement(found.Component, { ...found.def.inject?.(sessionId), t })
  }
  return <>
    <style>{`:root { font-family: system-ui; --dsw-specific-menu: white; --dsw-elevation-prominent: 0 4px 20px #0003;
      --dsw-alias-label-primary: #171717; --dsw-alias-label-secondary: #444; --dsw-alias-label-tertiary: #666;
      --dsw-alias-border-l2: #ddd; --dsw-alias-border-l3: #ccc; --dsw-alias-interactive-bg-hover: #eee;
      --dsw-alias-state-success-primary: #198754; --dsw-alias-state-error-primary: #cf222e; --dsw-alias-state-warn-label: #9a6700; }
      body { margin: 0; } button { font: inherit; }
      .tools { position: fixed; left: 40px; right: 40px; bottom: 44px; display: flex; justify-content: flex-end; gap: 8px; }
      .dock { position: fixed; left: 0; right: 0; bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 12px; padding-top: 4px; max-width: 100%; }`}</style>
    <div className="tools" data-tools>{entry('conversation.input.right', 'codex-speed')}</div>
    <div className="dock" data-composer-dock>
      <button type="button" data-sibling-pill>12 steps · 41 tok/s</button>
      {entry('conversation.composer.dock', 'subscription-usage')}
    </div>
  </>
}

Object.assign(scope, {
  __boot() {
    const loaded = scope.__LOADED__
    if (loaded === undefined) throw new Error('lib/client.js did not register itself with __ModuleLoader__')
    const exports = loaded.factory((name: string) => {
      requested.push(name)
      if (!(name in table)) throw new Error(`module table has no "${name}"`)
      return table[name]
    })
    ;(exports.apply as (context: unknown) => void)(ctx)
    ReactDOMClient.createRoot(document.getElementById('root')!).render(<Dock sessionId="session-1" />)
  },
  __report: () => ({
    id: scope.__LOADED__?.id,
    requested: [...requested],
    commands,
    registered: registrations.map(item => `${item.def.name}/${item.def.id ?? item.def.key}`),
    primitivesReads: [...primitivesReads].filter((key): key is string => typeof key === 'string'),
  }),
})
