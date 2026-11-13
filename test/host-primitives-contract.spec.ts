import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import ts from 'typescript'
import { hostPrimitivesExports, hostPrimitivesVersion } from './fixtures/host-primitives-exports.js'
import type { SubscriptionUsageBadge as SubscriptionUsageBadgeComponent } from '../src/client/SubscriptionUsageBadge.js'

const PRIMITIVES = '@deepseek-ai/dsh-client-ui-primitives'

// The client bundle resolves '@deepseek-ai/dsh-client-ui-primitives' against the
// host's module table at runtime. A named import the host stops exporting is
// `undefined` there; it compiles, loads, and throws only when something calls it.
// DSH 0.2.2-alpha.2 removed `useAnchoredPosition` that way, and the usage badge
// (which called it on every render) disappeared from the composer.

const clientDir = fileURLToPath(new URL('../../src/client/', import.meta.url))

test('client sources only take named imports from the host primitives that the supported host still exports', () => {
  const exported = new Set(hostPrimitivesExports)
  const files = readdirSync(clientDir, { recursive: true, encoding: 'utf8' }).filter(file => /\.tsx?$/.test(file))
  assert.ok(files.length > 10, `expected client sources under ${clientDir}`)
  const problems: string[] = []
  for (const file of files) {
    const text = readFileSync(`${clientDir}${file}`, 'utf8')
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const namespaces = new Set<string>()
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
      if (statement.moduleSpecifier.text !== PRIMITIVES) continue
      const clause = statement.importClause
      if (clause === undefined || clause.isTypeOnly) continue // types are erased; side-effect import loads nothing named
      if (clause.name !== undefined) problems.push(`${file}: default import ${clause.name.text} (the host module has no default export)`)
      const bindings = clause.namedBindings
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) namespaces.add(bindings.name.text)
      if (bindings !== undefined && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) {
          const name = (element.propertyName ?? element.name).text
          if (!element.isTypeOnly && !exported.has(name)) problems.push(`${file}: named import ${name}`)
        }
      }
    }
    // `primitives.name` reads on a namespace import are the same runtime lookup.
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && namespaces.has(node.expression.text)
        && !exported.has(node.name.text)) problems.push(`${file}: ${node.expression.text}.${node.name.text}`)
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.deepEqual(problems, [], `not exported by the DSH ${hostPrimitivesVersion} module table; look glyphs up by name (host-icons.ts) and keep behaviour local`)
})

test('the usage badge renders on a host whose primitives are exactly the supported export set', async () => {
  const names = hostPrimitivesExports.filter(name => /^[A-Za-z_$][\w$]*$/.test(name))
  const stub = `const stub = () => null\n${names.map(name => `export const ${name} = stub`).join('\n')}\n`
  const stubUrl = `data:text/javascript,${encodeURIComponent(stub)}`
  assert.ok(!names.includes('useAnchoredPosition'), 'the fixture models the host that dropped it')
  const hooks = registerHooks({
    resolve: (specifier, context, nextResolve) => specifier === PRIMITIVES
      ? { url: stubUrl, shortCircuit: true }
      : nextResolve(specifier, context),
  })
  let Badge: typeof SubscriptionUsageBadgeComponent
  try {
    // A fresh module instance, so the badge binds to the stubbed host module.
    const specifier = `../src/client/SubscriptionUsageBadge.js?primitives=${hostPrimitivesVersion}`
    Badge = (await import(specifier) as { SubscriptionUsageBadge: typeof SubscriptionUsageBadgeComponent }).SubscriptionUsageBadge
  } finally {
    hooks.deregister()
  }
  const rpc = { call: async () => { throw new Error('not reached by a server render') } } as never
  const props = { rpc, currentModel: async () => undefined } as never
  // Before this fix the render itself threw: `useAnchoredPosition is not a function`.
  const html = renderToStaticMarkup(createElement(Badge, props))
  // No usage has loaded yet, so only the invisible dock seat is rendered.
  assert.equal(html, '<span style="display:none" aria-hidden="true"></span>')
})
