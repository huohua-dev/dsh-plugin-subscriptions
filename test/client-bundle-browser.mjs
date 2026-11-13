// Optional offline check of the SHIPPED browser bundle against a stand-in for the
// DSH 0.2.2 web shell (a module table without useAnchoredPosition):
//   pnpm build && PLAYWRIGHT_PATH=/path/to/playwright node test/client-bundle-browser.mjs
// It loads lib/client.js unmodified (CLIENT_BUNDLE=<path> picks another build, e.g.
// an installed copy), runs its apply() against a recording ctx, renders the
// composer dock entries it registered, and drives the usage badge.
// No running DSH server, real accounts, credentials, screenshots or model writes.
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const dependencies = await readdir('node_modules/.pnpm')
const packagePath = name => resolve('node_modules/.pnpm', dependencies.find(entry => entry.startsWith(`${name}@`)), 'node_modules', name)
const { build } = await import(pathToFileURL(`${packagePath('rolldown')}/dist/index.mjs`))
const { chromium } = await import(pathToFileURL(`${process.env.PLAYWRIGHT_PATH}/index.mjs`))
const bundlePath = process.env.CLIENT_BUNDLE ?? 'lib/client.js'
const bundle = await readFile(bundlePath, 'utf8').catch(() => { throw new Error(`${bundlePath} is missing; run \`pnpm build\` first`) })
const result = await build({
  input: 'test/client-bundle-browser.fixture.tsx',
  resolve: { alias: { 'react-dom/client': `${packagePath('react-dom')}/client.js` } },
  transform: { define: { 'process.env.NODE_ENV': '"production"' } },
  output: { format: 'iife' }, write: false,
  logLevel: 'silent',
})
const app = result.output.find(file => file.type === 'chunk').code
const html = '<!doctype html><meta charset="utf-8"><div id="root"></div>'
  + '<script src="/app.js"></script><script src="/client.js"></script><script>window.__boot()</script>'
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) })
try {
  const context = await browser.newContext({ viewport: { width: 900, height: 700 } })
  await context.route('**/*', route => {
    const url = route.request().url()
    const [body, type] = url.endsWith('/app.js') ? [app, 'text/javascript']
      : url.endsWith('/client.js') ? [bundle, 'text/javascript'] : [html, 'text/html']
    return route.fulfill({ status: 200, contentType: `${type}; charset=utf-8`, body })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  page.on('console', message => { if (message.type() === 'error') { errors.push(message.text()); console.error(message.text()) } })
  await page.goto('http://client-bundle.test/')

  const pill = page.locator('button.dsh-subscription-usage-pill')
  const dialog = page.getByRole('dialog', { name: 'Subscription usage', exact: true })
  const sibling = page.locator('[data-sibling-pill]')
  await pill.waitFor()
  assert.match(await pill.innerText(), /^Codex .*%/, 'the badge shows the current model provider')
  console.log('pill rendered:', JSON.stringify(await pill.innerText()))

  // Registration wiring: what apply() mounted, what it asked the module table for.
  const report = await page.evaluate(() => window.__report())
  assert.equal(report.id, 'dsh-plugin-subscriptions')
  assert.deepEqual(report.requested.sort(), ['@deepseek-ai/dsh-client-ui-primitives', 'react', 'react-dom', 'react/jsx-runtime'])
  for (const entry of ['settings.section/subscriptions', 'tool.call.toolview/image_generate', 'tool.call.toolview/video_generate',
    'conversation.input.right/codex-speed', 'conversation.composer.dock/subscription-usage']) {
    assert.ok(report.registered.includes(entry), `registered ${entry}: ${report.registered.join(', ')}`)
  }
  assert.deepEqual(report.commands, ['fast'])
  // The only host-primitives reads allowed are decorative glyph lookups by name.
  const reads = report.primitivesReads.filter(key => key !== '__esModule')
  assert.deepEqual(reads.sort(), ['IconDataOutlineRegular', 'IconSparkleRegular'], 'no behavioural host primitive is read')

  // Opening: the dialog hangs above the pill with the 8px gap, inside the 12px viewport margin.
  const geometry = async () => {
    const [p, d, viewport] = await Promise.all([pill.boundingBox(), dialog.boundingBox(), page.viewportSize()])
    return { p, d, viewport }
  }
  const expectPlaced = async label => {
    // Placement settles on the layout effect and the ResizeObserver pass after it.
    await page.waitForFunction(() => {
      const panel = document.querySelector('[role="dialog"].dsh-subscription-usage-panel')
      const trigger = document.querySelector('button.dsh-subscription-usage-pill')
      if (!panel || !trigger) return false
      return Math.abs(panel.getBoundingClientRect().bottom + 8 - trigger.getBoundingClientRect().top) < 1.5
    }, undefined, { timeout: 3000 }).catch(() => {})
    const { p, d, viewport } = await geometry()
    assert.ok(Math.abs(d.y + d.height + 8 - p.y) <= 1.5, `${label}: dialog bottom ${d.y + d.height} sits 8px above the pill top ${p.y}`)
    assert.ok(d.x >= 12 - 0.5, `${label}: left margin kept (${d.x})`)
    assert.ok(d.x + d.width <= viewport.width - 12 + 0.5, `${label}: right margin kept (${d.x + d.width} of ${viewport.width})`)
    assert.ok(d.y >= 12 - 0.5, `${label}: top margin kept (${d.y})`)
    return { p, d }
  }
  await pill.click()
  await dialog.waitFor()
  const first = await expectPlaced('open')
  assert.ok(Math.abs(first.d.x - first.p.x) <= 1.5 || first.d.x <= 12.5, 'dialog lines up with the pill start unless clamped')
  assert.equal(await dialog.locator('section').count(), 1, 'only the signed-in provider is listed')
  console.log('dialog placed:', JSON.stringify({ pill: first.p, dialog: first.d }))

  // The panel grows when a disclosure opens; its bottom edge must stay glued to the pill.
  const summary = dialog.locator('summary')
  assert.equal(await summary.count(), 1, 'extra Codex windows sit behind one disclosure')
  const before = first.d.height
  await summary.click()
  await page.waitForFunction(h => document.querySelector('[role="dialog"].dsh-subscription-usage-panel').getBoundingClientRect().height > h, before)
  const grown = await expectPlaced('after expanding')
  assert.ok(grown.d.height > before)

  // Dismissal: Escape, outside pointer, and a click on a sibling pill all close it.
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  await pill.click()
  await dialog.waitFor()
  await page.mouse.click(8, 8)
  await dialog.waitFor({ state: 'detached' })
  await pill.click()
  await dialog.waitFor()
  await sibling.click()
  await dialog.waitFor({ state: 'detached' })
  await pill.click()
  await dialog.waitFor()
  await pill.click()
  await dialog.waitFor({ state: 'detached' })
  console.log('dismissal: Escape, outside pointer, sibling pill and the toggle itself close the dialog')

  // Layout changes while open: a narrow window re-places the dialog inside the margins.
  await pill.click()
  await dialog.waitFor()
  await page.setViewportSize({ width: 360, height: 600 })
  await expectPlaced('narrow viewport')
  await page.setViewportSize({ width: 900, height: 700 })
  await expectPlaced('restored viewport')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })

  // The sibling composer entry registered by the same bundle renders too.
  await page.getByRole('button', { name: /Speed/ }).waitFor()

  assert.deepEqual(errors, [])
  console.log('100%: shipped client bundle works against a host without useAnchoredPosition')
} finally { await browser.close() }
