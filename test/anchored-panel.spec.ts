import { test } from 'node:test'
import assert from 'node:assert/strict'
import { placePanel, topMarginFor } from '../src/client/anchored-panel.js'
import type { PanelPlacement } from '../src/client/anchored-panel.js'

// A 1000x800 window, a 120x20 trigger sitting 40px above the bottom edge and a
// 300x200 panel: the shape of the usage badge opening upward from the composer.
const base: PanelPlacement = {
  anchor: { left: 400, right: 520, top: 740, bottom: 760 },
  panel: { width: 300, height: 200 },
  viewport: { width: 1000, height: 800 },
  side: 'top',
  align: 'start',
  gap: 8,
  margin: 12,
  topMargin: 12,
}

test('a panel hangs above its trigger with the gap between them and lines up with the trigger start', () => {
  assert.deepEqual(placePanel(base), { left: 400, top: 740 - 8 - 200 })
})

test('a panel hangs below its trigger when asked to', () => {
  assert.deepEqual(placePanel({ ...base, side: 'bottom', anchor: { left: 10, right: 130, top: 30, bottom: 50 } }), { left: 12, top: 58 })
})

test('end alignment lines the panel right edge up with the trigger right edge', () => {
  assert.deepEqual(placePanel({ ...base, align: 'end' }), { left: 520 - 300, top: 532 })
})

test('the panel is clamped inside the left and right viewport margins', () => {
  assert.equal(placePanel({ ...base, anchor: { left: -50, right: 70, top: 740, bottom: 760 } }).left, 12)
  assert.equal(placePanel({ ...base, anchor: { left: 950, right: 1070, top: 740, bottom: 760 } }).left, 1000 - 300 - 12)
})

test('the panel never rises into the reserved top strip of the desktop frame', () => {
  const tall = { ...base, anchor: { left: 400, right: 520, top: 100, bottom: 120 }, topMargin: 68 }
  assert.equal(placePanel(tall).top, 68, 'would otherwise start at -108')
  assert.equal(placePanel({ ...tall, topMargin: 12 }).top, 12)
})

test('a trigger near the bottom edge keeps the panel inside the bottom margin', () => {
  const low = { ...base, side: 'bottom' as const, anchor: { left: 400, right: 520, top: 760, bottom: 780 } }
  assert.equal(placePanel(low).top, 800 - 200 - 12)
})

test('an unmeasured panel is placed from the trigger alone, without clamping', () => {
  const unmeasured = { ...base, panel: { width: 0, height: 0 }, anchor: { left: -50, right: 70, top: 5, bottom: 25 } }
  assert.deepEqual(placePanel(unmeasured), { left: -50, top: 5 - 8 })
})

test('the top inset follows the frame clearance the desktop shell publishes', () => {
  assert.equal(topMarginFor(12, '', false), 12, 'plain browser: no clearance published')
  assert.equal(topMarginFor(12, ' 48px', false), 68, 'macOS strip plus the 20px overlay gap')
  assert.equal(topMarginFor(12, '48px', true), 20, 'native fullscreen keeps only the 20px gap')
  assert.equal(topMarginFor(24, '0px', true), 24, 'the overlay margin is a floor')
  assert.equal(topMarginFor(12, 'calc(48px + 20px)', false), 12, 'an unparsable value is treated as unpublished')
})
